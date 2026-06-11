# AI Analyst — Provider Configuration & Migration

The AI Analyst ("talk to your portfolio") is powered by a Supabase Edge Function
(`supabase/functions/ai-analyst/index.ts`) that proxies an LLM provider. The API
key **never** touches the browser — it lives only as a Supabase secret.

## Current setup: Anthropic Claude

1. Get an API key from https://console.anthropic.com/
2. Set it as a secret on the project:

   ```bash
   supabase secrets set --project-ref spyacqjjceboodaxsnbi ANTHROPIC_API_KEY=sk-ant-...
   ```

   (Or in the dashboard: Project Settings → Edge Functions → Secrets.)

3. That's it. The function reads `ANTHROPIC_API_KEY` at runtime. Until it's set,
   the AI Analyst returns a clear 503 telling you the key is missing.

- Model: `claude-sonnet-4-20250514` (constant `ANTHROPIC_MODEL` in the function).
- The function injects a **live portfolio context block** (holdings, weights,
  P&L, beta, sector exposure, balances) into the system prompt. It reads the
  caller's own data under RLS using the JWT forwarded from the browser, so the
  model only ever sees the signed-in user's portfolio.

## How the request flows

```
Browser (AIAnalyst.jsx)
  -> supabase.functions.invoke("ai-analyst", { body: { messages } })   // sends user JWT
     -> Edge fn verifies JWT, reads portfolio via RLS, builds context
        -> Anthropic Messages API (x-api-key = ANTHROPIC_API_KEY secret)
     <- { text }
```

## Switching providers (e.g. OpenAI)

Edit `supabase/functions/ai-analyst/index.ts`:

1. Replace the `fetch("https://api.anthropic.com/v1/messages", …)` block with the
   provider's chat-completions call. Keep `buildPortfolioContext()` unchanged and
   pass it as the system message.
2. Read a new secret name (e.g. `OPENAI_API_KEY`) via `Deno.env.get(...)`.
3. Map the response to `{ text }`.
4. Redeploy:

   ```bash
   supabase functions deploy ai-analyst
   ```

5. Set the new secret: `supabase secrets set OPENAI_API_KEY=...`

No frontend changes are required — `AIAnalyst.jsx` only sends `{ messages }` and
reads `{ text }`.

## Streaming (future enhancement)

The current implementation returns the full completion in one response. To stream,
switch the function to return a `ReadableStream` (SSE) and update `AIAnalyst.jsx`
to consume it incrementally instead of `supabase.functions.invoke`.
