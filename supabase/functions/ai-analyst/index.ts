import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";
import { buildSystemPrompt } from "./prompt.ts";
import { executeTool, TOOLS, TOOL_STATUS, WRITE_LABELS, WRITE_TOOLS } from "./tools.ts";

/* ------------------------------------------------------------------
   FINANCE AI — agentic Anthropic proxy with live portfolio tools.
   Streams an app-level SSE protocol to the browser (see README in
   plan): text_delta / thinking_delta / status / tool_activity /
   pending_confirmation / data_changed / assistant_snapshot / done /
   error. Reads run automatically under the caller's JWT (RLS);
   writes only run when the request's resume.approvals contains the
   matching tool_use_id — the model cannot bypass confirmation.
   ------------------------------------------------------------------ */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_MODEL = "claude-opus-4-8";
// Models this (Claude) function serves. Non-Claude picks are routed by the
// frontend to the ai-analyst-openai function instead.
const CLAUDE_MODELS = new Set(["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-8", "claude-fable-5"]);
// Auto mode: cheapest capable Claude tier per difficulty.
const TIER_TO_MODEL: Record<string, string> = {
  easy: "claude-haiku-4-5",
  moderate: "claude-sonnet-4-6",
  hard: "claude-opus-4-8",
  expert: "claude-fable-5",
};
const MAX_TOKENS = 16000;
const MAX_ITERATIONS = 15;
const SOFT_DEADLINE_MS = 100_000; // Supabase edge wall clock is ~150s

type Approval = { tool_use_id: string; approved: boolean; reason?: string };
type ReadResult = { tool_use_id: string; content: string; is_error?: boolean };

// deno-lint-ignore no-explicit-any
type Json = any;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/** Clone messages and put a cache breakpoint on the last cacheable block
 *  so each turn extends the cached conversation prefix. */
function withMessageCache(messages: Json[]): Json[] {
  const out = messages.map((m) => ({ ...m }));
  const last = out[out.length - 1];
  if (!last) return out;
  if (typeof last.content === "string") {
    last.content = [{ type: "text", text: last.content, cache_control: { type: "ephemeral" } }];
  } else if (Array.isArray(last.content) && last.content.length) {
    last.content = last.content.map((b: Json, i: number) =>
      i === last.content.length - 1 ? { ...b, cache_control: { type: "ephemeral" } } : b
    );
  }
  return out;
}

/** Repair a message history before sending it to the API.
 *
 *  A server-tool `pause_turn` (web_search / its built-in code_execution dynamic
 *  filtering) splits ONE logical assistant turn across several streamed
 *  responses. The old client stored each fragment as its own assistant message,
 *  so a `server_tool_use` block lands in a different message from its
 *  `*_tool_result` — and if the turn was aborted mid-pause, the result never
 *  arrived at all. Either way the API rejects the orphan ("`code_execution`
 *  tool use … was found without a corresponding `code_execution_tool_result`
 *  block"). This heals both cases, including conversations already persisted in
 *  the broken shape:
 *    1. Merge adjacent assistant messages so a split-but-complete turn pairs up.
 *    2. Drop any unpaired server-tool block (use without result, or result
 *       without use) from every message EXCEPT the last — the last assistant
 *       message may legitimately end in an unresolved `server_tool_use` while we
 *       are mid-`pause_turn` and about to resume, and stripping it would break
 *       the resume. Our own client tool_use→tool_result pairs are untouched:
 *       those results live in `user` messages (type `tool_result`, not
 *       `*_tool_result`), so neither pass affects them. */
function sanitizeForApi(messages: Json[]): Json[] {
  // 1) Merge adjacent assistant turns (pause_turn fragments).
  const merged: Json[] = [];
  for (const m of messages) {
    const prev = merged[merged.length - 1];
    if (prev?.role === "assistant" && m.role === "assistant" && Array.isArray(prev.content) && Array.isArray(m.content)) {
      prev.content = [...prev.content, ...m.content];
    } else {
      merged.push({ ...m, content: Array.isArray(m.content) ? [...m.content] : m.content });
    }
  }

  // 2) Strip unpaired server-tool blocks from all but the last message.
  const isServerResult = (b: Json) => typeof b?.type === "string" && b.type.endsWith("_tool_result");
  for (let i = 0; i < merged.length - 1; i++) {
    const m = merged[i];
    if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
    const useIds = new Set(m.content.filter((b: Json) => b.type === "server_tool_use").map((b: Json) => b.id));
    const resultIds = new Set(m.content.filter(isServerResult).map((b: Json) => b.tool_use_id));
    m.content = m.content.filter((b: Json) => {
      if (b.type === "server_tool_use") return resultIds.has(b.id);
      if (isServerResult(b)) return useIds.has(b.tool_use_id);
      return true;
    });
  }
  return merged;
}

/** Last user message rendered to plain text (for the auto-mode classifier). */
function lastUserText(messages: Json[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) {
      const txt = m.content.filter((b: Json) => b?.type === "text").map((b: Json) => b.text).join(" ").trim();
      if (txt) return txt;
    }
  }
  return "";
}

/** Auto mode: a cheap Haiku call rates query difficulty, mapped to the cheapest
 *  capable Claude tier. Falls back to the default model on any error. Silent —
 *  the chosen model is not surfaced to the client. */
async function routeAuto(anthropic: Json, messages: Json[]): Promise<string> {
  const text = lastUserText(messages).slice(0, 2000);
  if (!text) return DEFAULT_MODEL;
  try {
    const r = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 8,
      system:
        "You route a finance question to a model tier. Reply with ONE word only: " +
        "easy, moderate, hard, or expert. " +
        "easy = greetings, simple lookups or definitions. " +
        "moderate = explanations or single-step analysis. " +
        "hard = multi-step valuation, comparisons, or portfolio reasoning. " +
        "expert = complex multi-constraint modeling or long-horizon analysis.",
      messages: [{ role: "user", content: text }],
    });
    const word = (r.content?.[0]?.text ?? "").toLowerCase().replace(/[^a-z]/g, "");
    return TIER_TO_MODEL[word] ?? DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return jsonError("ANTHROPIC_API_KEY is not configured. Set it with: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...", 503);
  }

  let body: Json;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const messages: Json[] = Array.isArray(body?.messages) ? body.messages : [];
  const resume = body?.resume as { approvals?: Approval[]; read_results?: ReadResult[] } | undefined;
  if (!messages.length) return jsonError("messages is required", 400);

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );

  const anthropic = new Anthropic({ apiKey });
  // Resolve the model: explicit Claude pick, or auto-route via a cheap classifier.
  // (Unknown / non-Claude ids fall back to the default — those are served elsewhere.)
  const requested = typeof body?.model === "string" ? body.model : DEFAULT_MODEL;
  const activeModel = requested === "auto"
    ? await routeAuto(anthropic, messages)
    : (CLAUDE_MODELS.has(requested) ? requested : DEFAULT_MODEL);
  const system = [{ type: "text", text: buildSystemPrompt(), cache_control: { type: "ephemeral" } }];
  const tools = [...TOOLS, { type: "web_search_20260209", name: "web_search" }];
  const started = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Json) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const finish = (stopReason: string) => {
        send({ type: "done", stop_reason: stopReason });
        controller.close();
      };

      try {
        /* ---- resume: resolve the pending tool_use turn first ---- */
        if (resume) {
          const last = messages[messages.length - 1];
          if (last?.role !== "assistant" || !Array.isArray(last.content)) {
            send({ type: "error", message: "Invalid resume: last message is not an assistant tool turn." });
            return finish("error");
          }
          const toolUses = last.content.filter((b: Json) => b.type === "tool_use");
          const readResults = new Map((resume.read_results ?? []).map((r) => [r.tool_use_id, r]));
          const approvals = new Map((resume.approvals ?? []).map((a) => [a.tool_use_id, a]));
          const resultBlocks: Json[] = [];

          for (const tu of toolUses) {
            if (WRITE_TOOLS.has(tu.name)) {
              const approval = approvals.get(tu.id);
              if (approval?.approved) {
                send({ type: "status", label: TOOL_STATUS[tu.name] ?? "Working…" });
                const outcome = await executeTool(supabase, tu.name, tu.input ?? {});
                send({
                  type: "tool_activity",
                  name: tu.name,
                  label: WRITE_LABELS[tu.name] ?? tu.name,
                  is_error: !!outcome.is_error,
                });
                if (!outcome.is_error && outcome.changes?.length) {
                  send({ type: "data_changed", changes: outcome.changes });
                }
                resultBlocks.push({
                  type: "tool_result",
                  tool_use_id: tu.id,
                  content: outcome.content,
                  is_error: !!outcome.is_error,
                });
              } else {
                const reason = approval?.reason ? ` Reason: ${approval.reason}` : "";
                resultBlocks.push({
                  type: "tool_result",
                  tool_use_id: tu.id,
                  content: `User declined this action.${reason} Do not retry it unless the user asks.`,
                  is_error: true,
                });
              }
            } else {
              // Read tool: prefer the result captured before the confirmation
              // round trip; re-execute if the client didn't send it back.
              const cached = readResults.get(tu.id);
              if (cached) {
                resultBlocks.push({
                  type: "tool_result",
                  tool_use_id: tu.id,
                  content: cached.content,
                  is_error: !!cached.is_error,
                });
              } else {
                const outcome = await executeTool(supabase, tu.name, tu.input ?? {});
                if (outcome.artifactEdit) send({ type: "artifact_edit", ...outcome.artifactEdit });
                if (outcome.artifactOpen) send({ type: "artifact_open", ...outcome.artifactOpen });
                if (outcome.reportPatch) send({ type: "report_patch", ...outcome.reportPatch });
                resultBlocks.push({
                  type: "tool_result",
                  tool_use_id: tu.id,
                  content: outcome.content,
                  is_error: !!outcome.is_error,
                });
              }
            }
          }
          messages.push({ role: "user", content: resultBlocks });
          // Echo so the client can mirror this push into its canonical history.
          send({ type: "tool_results_snapshot", content: resultBlocks });
        }

        /* ----------------------- agentic loop ----------------------- */
        // The web_search tool runs its result-filtering code in a sandbox
        // container. When a turn pauses (pause_turn) with pending code-execution
        // tool uses, the resume request must reference that same container, or
        // the API 400s ("container_id is required when there are pending tool
        // uses generated by code execution"). Capture it from each response and
        // pass it back on subsequent requests.
        let containerId: string | null = null;
        for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
          if (Date.now() - started > SOFT_DEADLINE_MS) {
            send({
              type: "text_delta",
              text: "\n\n*Session time limit reached — send another message and I'll continue.*",
            });
            return finish("timeout");
          }

          send({ type: "message_start" });

          const apiStream = anthropic.messages.stream({
            model: activeModel,
            max_tokens: MAX_TOKENS,
            thinking: { type: "adaptive", display: "summarized" },
            system,
            tools,
            ...(containerId ? { container: containerId } : {}),
            messages: withMessageCache(sanitizeForApi(messages)),
          } as Json);

          for await (const event of apiStream) {
            if (event.type === "content_block_start") {
              const block = (event as Json).content_block;
              if (block?.type === "server_tool_use") {
                send({ type: "status", label: "Searching the web…" });
              } else if (block?.type === "thinking") {
                send({ type: "status", label: "Thinking…" });
              }
            } else if (event.type === "content_block_delta") {
              const delta = (event as Json).delta;
              if (delta?.type === "text_delta") send({ type: "text_delta", text: delta.text });
              else if (delta?.type === "thinking_delta" && delta.thinking) {
                send({ type: "thinking_delta", text: delta.thinking });
              }
            }
          }

          const final = await apiStream.finalMessage();
          if ((final as Json).container?.id) containerId = (final as Json).container.id;
          messages.push({ role: "assistant", content: final.content });
          send({ type: "assistant_snapshot", content: final.content });

          if (final.stop_reason === "pause_turn") continue; // server tool resumes

          if (final.stop_reason === "tool_use") {
            const toolUses = (final.content as Json[]).filter((b) => b.type === "tool_use");
            const writes = toolUses.filter((tu) => WRITE_TOOLS.has(tu.name));
            const reads = toolUses.filter((tu) => !WRITE_TOOLS.has(tu.name));

            const readResults: ReadResult[] = [];
            for (const tu of reads) {
              send({ type: "status", label: TOOL_STATUS[tu.name] ?? "Working…" });
              const outcome = await executeTool(supabase, tu.name, tu.input ?? {});
              send({ type: "tool_activity", name: tu.name, label: TOOL_STATUS[tu.name] ?? tu.name, is_error: !!outcome.is_error });
              if (outcome.artifactEdit) send({ type: "artifact_edit", ...outcome.artifactEdit });
              if (outcome.artifactOpen) send({ type: "artifact_open", ...outcome.artifactOpen });
              if (outcome.reportPatch) send({ type: "report_patch", ...outcome.reportPatch });
              readResults.push({ tool_use_id: tu.id, content: outcome.content, is_error: outcome.is_error });
            }

            if (writes.length) {
              send({
                type: "pending_confirmation",
                read_results: readResults,
                writes: writes.map((tu) => ({
                  tool_use_id: tu.id,
                  name: tu.name,
                  label: WRITE_LABELS[tu.name] ?? tu.name,
                  input: tu.input,
                })),
              });
              return finish("pending_confirmation");
            }

            const resultContent = readResults.map((r) => ({
              type: "tool_result",
              tool_use_id: r.tool_use_id,
              content: r.content,
              is_error: !!r.is_error,
            }));
            messages.push({ role: "user", content: resultContent });
            send({ type: "tool_results_snapshot", content: resultContent });
            continue;
          }

          if (final.stop_reason === "max_tokens") {
            send({ type: "text_delta", text: "\n\n*Response truncated — say \"continue\" for the rest.*" });
            return finish("max_tokens");
          }

          // end_turn, refusal, or anything else: we're done.
          return finish(final.stop_reason ?? "end_turn");
        }

        send({ type: "text_delta", text: "\n\n*Hit the tool-call limit for one turn — send another message to continue.*" });
        finish("iteration_limit");
      } catch (err) {
        try {
          send({ type: "error", message: err instanceof Error ? err.message : String(err) });
          controller.close();
        } catch {
          /* controller already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
