const COHERE_URL = "https://api.cohere.com/v2/chat";
const PROXY_URL = "/api/chat";
const KEY_STORAGE = "cohere_api_key";

export const DEFAULT_MODEL = "command-a-plus-05-2026";

export type KeyPersistence = "session" | "local";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// In production builds, the same-origin server proxy is the only path. In
// dev, we fall back to the user's stored key + direct Cohere call so the
// agent works without running the proxy locally.
const PROD = import.meta.env.PROD;

export function isProxyOnly(): boolean {
  return PROD;
}

export function getApiKey(): string | null {
  if (PROD) return null;
  const env = (import.meta.env as Record<string, string>).VITE_COHERE_API_KEY;
  if (env) return env;
  try {
    return (
      window.sessionStorage.getItem(KEY_STORAGE) ??
      window.localStorage.getItem(KEY_STORAGE)
    );
  } catch {
    return null;
  }
}

export function setApiKey(key: string | null, persistence: KeyPersistence = "session") {
  try {
    window.sessionStorage.removeItem(KEY_STORAGE);
    window.localStorage.removeItem(KEY_STORAGE);
    if (key) {
      const store = persistence === "local" ? window.localStorage : window.sessionStorage;
      store.setItem(KEY_STORAGE, key);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Stream a chat completion.
 *
 * `context` carries catalog/telemetry facts for the selected satellite. It is
 * sent as a separate field, NOT as a `system` message: the server owns the
 * assistant's instructions and treats this purely as data. That's what stops
 * /api/chat being usable as a general-purpose LLM by anyone who finds it.
 */
export async function* streamChat(opts: {
  context?: string;
  messages: ChatMessage[];
  apiKey?: string;
  model?: string;
  signal?: AbortSignal;
}): AsyncGenerator<string, void, void> {
  const proxyRes = await fetch(PROXY_URL, {
    method: "POST",
    signal: opts.signal,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      context: opts.context,
      messages: opts.messages,
    }),
  }).catch((err: unknown) => {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return null;
  });

  if (proxyRes && proxyRes.ok && proxyRes.body) {
    yield* parseStream(proxyRes.body);
    return;
  }

  // Proxy returned a hard error → bubble it (don't fall back, the deployed
  // site has CSP that blocks api.cohere.com anyway). Log the raw body for
  // debugging but never render it: it can carry upstream account detail.
  if (proxyRes && proxyRes.status !== 503 && proxyRes.status !== 404) {
    let body = "";
    try {
      body = await proxyRes.text();
    } catch {
      /* ignore */
    }
    if (body) console.error(`[cohere] proxy ${proxyRes.status}: ${body}`);
    if (proxyRes.status === 401) throw new Error("Server-side Cohere key invalid.");
    if (proxyRes.status === 429) throw new Error("Too many requests. Try again shortly.");
    if (proxyRes.status === 400) throw new Error("That request couldn't be processed.");
    throw new Error("The assistant is unavailable right now. Try again shortly.");
  }

  // Proxy not configured (dev mode, or missing env var). Fall back to direct
  // Cohere with a client-supplied key — only meaningful in dev.
  if (PROD) {
    throw new Error("Server proxy unavailable. Check that COHERE_API_KEY is set on the server.");
  }
  if (!opts.apiKey) {
    throw new Error("No proxy and no Cohere API key set. Enter one to use the agent.");
  }

  const direct = await fetch(COHERE_URL, {
    method: "POST",
    signal: opts.signal,
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      // Dev-only path: no proxy in front, so the context becomes a local system
      // message here. In production the server owns this (see above).
      messages: opts.context
        ? [{ role: "system" as const, content: opts.context }, ...opts.messages]
        : opts.messages,
      stream: true,
    }),
  });

  if (!direct.ok || !direct.body) {
    let body = "";
    try {
      body = await direct.text();
    } catch {
      /* ignore */
    }
    if (direct.status === 401) throw new Error("Invalid Cohere API key.");
    if (direct.status === 429) throw new Error("Cohere rate limit hit.");
    throw new Error(`Cohere ${direct.status}: ${body || direct.statusText}`);
  }

  yield* parseStream(direct.body);
}

async function* parseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<string, void, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const raw = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!raw) continue;
      const line = raw.startsWith("data:") ? raw.slice(5).trim() : raw;
      if (!line || line === "[DONE]") continue;
      try {
        const event = JSON.parse(line);
        if (event.type === "content-delta") {
          const text: string | undefined = event?.delta?.message?.content?.text;
          if (text) yield text;
        } else if (event.type === "message-end" && event?.delta?.finish_reason === "ERROR") {
          throw new Error(event?.delta?.error || "Cohere stream error");
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
}
