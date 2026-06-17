import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { executeTool, TOOL_STATUS, TOOLS, WRITE_TOOLS } from "../ai-analyst/tools.ts";
import { buildSystemPrompt } from "../ai-analyst/prompt.ts";

/* ------------------------------------------------------------------
   FINANCE AI — OpenAI-format provider proxy (OpenAI / DeepSeek / Gemini).
   READ-ONLY: serves the same read tools as the Claude analyst but NONE
   of the write tools — only Claude can edit the portfolio. Translates
   each provider's chat/completions streaming + tool loop into the same
   app-level SSE protocol the browser already consumes (text_delta /
   thinking_delta / status / tool_activity / done / error). Portfolio
   reads run under the caller's JWT (RLS); provider keys are read from
   app_config with the service role. See ai-analyst/index.ts for the
   Claude (full-edit) counterpart.
   ------------------------------------------------------------------ */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MAX_ITERATIONS = 12;
const SOFT_DEADLINE_MS = 100_000;
// deno-lint-ignore no-explicit-any
type Json = any;

// provider -> base URL (chat/completions is appended) + app_config key name.
const PROVIDERS: Record<string, { base: string; keyName: string }> = {
  openai: { base: "https://api.openai.com/v1", keyName: "openai_api_key" },
  deepseek: { base: "https://api.deepseek.com", keyName: "deepseek_api_key" },
  gemini: { base: "https://generativelanguage.googleapis.com/v1beta/openai", keyName: "gemini_api_key" },
};

// Read-only tool set in OpenAI function-tool format (writes excluded).
const READ_TOOLS = (TOOLS as Json[])
  .filter((t) => !WRITE_TOOLS.has(t.name))
  .map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
const READ_TOOL_NAMES = new Set(READ_TOOLS.map((t) => t.function.name));
// Web search for non-Claude providers, backed by Gemini Google-Search grounding.
const WEB_SEARCH_TOOL = {
  type: "function",
  function: {
    name: "web_search",
    description: "Search the web for current information (recent news, prices, events, filings). Returns a concise grounded summary with source URLs.",
    parameters: { type: "object", properties: { query: { type: "string", description: "The search query." } }, required: ["query"], additionalProperties: false },
  },
};
const MODEL_TOOLS = [...READ_TOOLS, WEB_SEARCH_TOOL];

/** Web search via Gemini's google_search grounding (works for every provider). */
async function webSearch(query: string, geminiKey?: string): Promise<string> {
  if (!geminiKey) return "Web search is unavailable (no Gemini key configured).";
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Search the web and answer with the key facts, figures, and dates: ${query}` }] }],
        tools: [{ google_search: {} }],
      }),
    });
    const j = await r.json();
    const c = j.candidates?.[0] ?? {};
    const text = (c.content?.parts ?? []).map((p: Json) => p.text).filter(Boolean).join("\n").trim();
    const sources = (c.groundingMetadata?.groundingChunks ?? []).map((ch: Json) => ch.web?.uri).filter(Boolean).slice(0, 5);
    if (!text) return "No results found.";
    return text + (sources.length ? `\n\nSources:\n${sources.join("\n")}` : "");
  } catch (e) {
    return `Web search failed: ${String((e as Error)?.message ?? e)}`;
  }
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

/** Plain text of an Anthropic content value (drops tool/thinking blocks). */
function textOf(content: Json): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.filter((b) => b?.type === "text").map((b) => b.text).join("\n").trim();
  return "";
}

/** Convert the canonical Anthropic message history into text-only OpenAI
 *  messages. Prior tool_use/tool_result/thinking blocks are dropped — the
 *  model re-fetches via tools in the current turn as needed. Keeps the
 *  conversation coherent across a mid-thread provider switch. */
function toOpenAiHistory(messages: Json[]): Json[] {
  const out: Json[] = [];
  for (const m of messages) {
    if (m?.role !== "user" && m?.role !== "assistant") continue;
    const text = textOf(m.content);
    if (text) out.push({ role: m.role, content: text });
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  let body: Json;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  const messages: Json[] = Array.isArray(body?.messages) ? body.messages : [];
  if (!messages.length) return jsonError("messages is required", 400);

  // model arrives as "provider:model_id" (e.g. "openai:gpt-4o-mini").
  const raw = typeof body?.model === "string" ? body.model : "";
  const sep = raw.indexOf(":");
  const provider = sep > 0 ? raw.slice(0, sep) : "";
  let modelId = sep > 0 ? raw.slice(sep + 1) : "";
  const cfg = PROVIDERS[provider];
  if (!cfg || !modelId) return jsonError(`Unknown provider/model: ${raw}`, 400);
  if (provider === "gemini") modelId = modelId.replace(/^models\//, "");

  const url = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  // Portfolio reads run under the caller's JWT (RLS).
  const supabase = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "", {
    global: { headers: { Authorization: authHeader } },
  });
  // Provider key lives in app_config (service-role only). Prefer an env secret if set.
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { autoRefreshToken: false, persistSession: false } });
  const envKey = Deno.env.get(cfg.keyName.toUpperCase());
  let apiKey = envKey;
  if (!apiKey) {
    const { data } = await admin.from("app_config").select("value").eq("key", cfg.keyName).maybeSingle();
    apiKey = data?.value ?? undefined;
  }
  if (!apiKey) return jsonError(`${provider} API key is not configured.`, 503);

  // Gemini key backs the web_search tool for every provider.
  let geminiKey = provider === "gemini" ? apiKey : Deno.env.get("GEMINI_API_KEY") || undefined;
  if (!geminiKey) {
    const { data } = await admin.from("app_config").select("value").eq("key", "gemini_api_key").maybeSingle();
    geminiKey = data?.value ?? undefined;
  }

  const sys = buildSystemPrompt() +
    `\n\n# Runtime\nYou are running as ${provider} (${modelId}) in READ-ONLY mode. ` +
    `You can read the portfolio and live market data via tools, and you can search the web with the web_search tool, ` +
    `but you cannot create, edit, or delete anything. ` +
    `If the user asks to add, change, or remove holdings/transactions/watchlist/spreadsheet data, tell them to switch the model selector to a Claude model — only Claude can edit the portfolio.`;

  const oaMessages: Json[] = [{ role: "system", content: sys }, ...toOpenAiHistory(messages)];
  const started = Date.now();
  const encoder = new TextEncoder();
  const endpoint = `${cfg.base}/chat/completions`;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Json) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      const finish = (stopReason: string) => { send({ type: "done", stop_reason: stopReason }); controller.close(); };

      try {
        for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
          if (Date.now() - started > SOFT_DEADLINE_MS) {
            send({ type: "text_delta", text: "\n\n*Session time limit reached — send another message and I'll continue.*" });
            return finish("timeout");
          }
          send({ type: "message_start" });

          const resp = await fetch(endpoint, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: modelId, stream: true, messages: oaMessages, tools: MODEL_TOOLS, tool_choice: "auto" }),
          });
          if (!resp.ok || !resp.body) {
            const detail = await resp.text().catch(() => "");
            send({ type: "error", message: `${provider} error ${resp.status}: ${detail.slice(0, 400)}` });
            return finish("error");
          }

          // Accumulate one assistant turn from the SSE stream.
          let assistantText = "";
          const toolCalls = new Map<number, { id: string; name: string; args: string }>();
          let finishReason = "";
          const reader = resp.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            for (const line of lines) {
              const t = line.trim();
              if (!t.startsWith("data:")) continue;
              const payload = t.slice(5).trim();
              if (payload === "[DONE]") continue;
              let ev: Json;
              try { ev = JSON.parse(payload); } catch { continue; }
              const choice = ev.choices?.[0];
              if (!choice) continue;
              const delta = choice.delta ?? {};
              if (typeof delta.content === "string" && delta.content) {
                assistantText += delta.content;
                send({ type: "text_delta", text: delta.content });
              }
              // DeepSeek-reasoner / thinking models stream reasoning separately.
              if (typeof delta.reasoning_content === "string" && delta.reasoning_content) {
                send({ type: "thinking_delta", text: delta.reasoning_content });
              }
              for (const tc of delta.tool_calls ?? []) {
                const idx = tc.index ?? 0;
                const cur = toolCalls.get(idx) ?? { id: "", name: "", args: "" };
                if (tc.id) cur.id = tc.id;
                if (tc.function?.name) cur.name = tc.function.name;
                if (tc.function?.arguments) cur.args += tc.function.arguments;
                toolCalls.set(idx, cur);
              }
              if (choice.finish_reason) finishReason = choice.finish_reason;
            }
          }

          if (finishReason !== "tool_calls" || toolCalls.size === 0) return finish(finishReason || "stop");

          // Record the assistant turn, then execute each (read) tool call.
          const calls = Array.from(toolCalls.values()).filter((c) => c.id && c.name);
          oaMessages.push({
            role: "assistant",
            content: assistantText || null,
            tool_calls: calls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.args || "{}" } })),
          });

          for (const c of calls) {
            let result: string;
            let isError = false;
            if (c.name === "web_search") {
              send({ type: "status", label: "Searching the web…" });
              let q = "";
              try { q = JSON.parse(c.args || "{}").query ?? ""; } catch { /* keep "" */ }
              result = await webSearch(q, geminiKey);
              send({ type: "tool_activity", name: "web_search", label: "web search", is_error: false });
            } else if (READ_TOOL_NAMES.has(c.name)) {
              send({ type: "status", label: TOOL_STATUS[c.name] ?? "Working…" });
              let input: Json = {};
              try { input = c.args ? JSON.parse(c.args) : {}; } catch { /* keep {} */ }
              const outcome = await executeTool(supabase, c.name, input);
              isError = !!outcome.is_error;
              result = typeof outcome.content === "string" ? outcome.content : JSON.stringify(outcome.content);
              send({ type: "tool_activity", name: c.name, label: c.name, is_error: isError });
            } else {
              result = "This model is read-only. To modify the portfolio, the user must switch to a Claude model.";
            }
            oaMessages.push({ role: "tool", tool_call_id: c.id, content: result });
          }
        }
        send({ type: "text_delta", text: "\n\n*Reached the step limit for this turn.*" });
        return finish("max_iterations");
      } catch (e) {
        send({ type: "error", message: String((e as Error)?.message ?? e) });
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
});
