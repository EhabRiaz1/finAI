import { supabase } from "../lib/supabase";

/* ------------------------------------------------------------------
   SSE client for the ai-analyst edge function.
   supabase.functions.invoke() buffers the whole response, so we use
   raw fetch + ReadableStream and parse `data: {json}` frames.
   Yields parsed event objects (see edge function for the protocol).
   ------------------------------------------------------------------ */

export async function* streamChat(body, { signal } = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in.");

  // Claude ids + "auto" go to ai-analyst (full edit); other providers are read-only.
  const m = body?.model || "";
  const fn = /^(openai|deepseek|gemini):/.test(m) ? "ai-analyst-openai" : "ai-analyst";

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) message = j.error;
    } catch {
      /* not json */
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of frame.split("\n")) {
        if (line.startsWith("data: ")) {
          try {
            yield JSON.parse(line.slice(6));
          } catch {
            /* skip malformed frame */
          }
        }
      }
    }
  }
}
