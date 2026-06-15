import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/* ------------------------------------------------------------------
   ADMIN API — service-role action router for the master portal.
   Every action first verifies the caller's JWT email is in ALLOWLIST
   (server-side, never trusting a client flag), then uses the service
   role to read across all accounts / create new users. Reads only —
   no impersonation or edits of existing user data.
   ------------------------------------------------------------------ */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWLIST = ["admin@finance.ai"];

// deno-lint-ignore no-explicit-any
type Json = any;

function json(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 1) Identify the caller from their JWT (validated server-side).
  const authHeader = req.headers.get("Authorization") ?? "";
  const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authErr } = await authClient.auth.getUser();
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);
  if (!ALLOWLIST.includes((user.email ?? "").toLowerCase())) return json({ error: "Forbidden" }, 403);

  // 2) Service-role client bypasses RLS for cross-account reads / user creation.
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let body: Json;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const action = body?.action as string;

  try {
    switch (action) {
      case "list_accounts": {
        const { data: list, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (error) throw error;

        const [{ data: convos }, { data: eq }, { data: bd }] = await Promise.all([
          admin.from("ai_conversations").select("user_id, updated_at"),
          admin.from("equity_holdings").select("user_id"),
          admin.from("bond_holdings").select("user_id"),
        ]);

        const convoCount = new Map<string, number>();
        const lastActivity = new Map<string, string>();
        for (const c of convos ?? []) {
          convoCount.set(c.user_id, (convoCount.get(c.user_id) ?? 0) + 1);
          const prev = lastActivity.get(c.user_id);
          if (!prev || c.updated_at > prev) lastActivity.set(c.user_id, c.updated_at);
        }
        const holdingCount = new Map<string, number>();
        for (const h of [...(eq ?? []), ...(bd ?? [])]) {
          holdingCount.set(h.user_id, (holdingCount.get(h.user_id) ?? 0) + 1);
        }

        const accounts = (list.users ?? []).map((u) => ({
          id: u.id,
          email: u.email,
          name: u.user_metadata?.full_name ?? u.user_metadata?.name ?? null,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at ?? null,
          conversation_count: convoCount.get(u.id) ?? 0,
          holding_count: holdingCount.get(u.id) ?? 0,
          last_activity: lastActivity.get(u.id) ?? null,
        }));
        return json({ accounts });
      }

      case "get_conversations": {
        const userId = body?.userId as string;
        if (!userId) return json({ error: "userId is required" }, 400);
        const { data: convos, error } = await admin
          .from("ai_conversations")
          .select("id, title, created_at, updated_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false });
        if (error) throw error;

        const ids = (convos ?? []).map((c) => c.id);
        const counts = new Map<string, number>();
        if (ids.length) {
          const { data: msgs } = await admin
            .from("ai_messages")
            .select("conversation_id")
            .in("conversation_id", ids);
          for (const m of msgs ?? []) counts.set(m.conversation_id, (counts.get(m.conversation_id) ?? 0) + 1);
        }
        const conversations = (convos ?? []).map((c) => ({ ...c, message_count: counts.get(c.id) ?? 0 }));
        return json({ conversations });
      }

      case "get_messages": {
        const conversationId = body?.conversationId as string;
        if (!conversationId) return json({ error: "conversationId is required" }, 400);
        const { data: messages, error } = await admin
          .from("ai_messages")
          .select("seq, role, content, created_at")
          .eq("conversation_id", conversationId)
          .order("seq", { ascending: true });
        if (error) throw error;
        return json({ messages: messages ?? [] });
      }

      case "get_portfolio": {
        const userId = body?.userId as string;
        if (!userId) return json({ error: "userId is required" }, 400);
        const [eq, bd, tx, bal] = await Promise.all([
          admin.from("equity_holdings").select("*").eq("user_id", userId),
          admin.from("bond_holdings").select("*").eq("user_id", userId),
          admin.from("transactions").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
          admin.from("account_balances").select("*").eq("user_id", userId).maybeSingle(),
        ]);
        return json({
          equity_holdings: eq.data ?? [],
          bond_holdings: bd.data ?? [],
          transactions: tx.data ?? [],
          account_balances: bal.data ?? null,
        });
      }

      case "create_account": {
        const email = (body?.email as string ?? "").trim();
        const password = body?.password as string ?? "";
        const name = (body?.name as string ?? "").trim();
        if (!email || !password) return json({ error: "email and password are required" }, 400);
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: name ? { full_name: name } : {},
        });
        if (error) return json({ error: error.message }, 400);
        return json({ user: { id: data.user?.id, email: data.user?.email } });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
