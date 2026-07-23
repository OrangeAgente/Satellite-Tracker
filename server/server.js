// Production server: serves the Vite-built SPA from $STATIC_DIR and proxies
// /api/chat to Cohere v2 chat using a server-side key. The key never reaches
// the browser. Built with Node's stdlib only — no third-party deps.

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const STATIC_DIR = path.resolve(process.env.STATIC_DIR || path.join(__dirname, "..", "dist"));
const COHERE_KEY = process.env.COHERE_API_KEY || "";
const ALLOWED_MODELS = new Set(["command-a-plus-05-2026"]);
const DEFAULT_MODEL = "command-a-plus-05-2026";

const MAX_BODY_BYTES = 200_000;
const MAX_MESSAGES = 50;
const MAX_MESSAGE_CHARS = 16_000;

const SECURITY_HEADERS = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "object-src 'none'",
  ].join("; "),
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
};

function setBaseHeaders(res) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  res.setHeader("Server", "sattracker");
}

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

// Tiny in-memory token-bucket rate limit per IP (defense-in-depth — Cohere
// also rate-limits at the account level).
const RATE_BUCKETS = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30; // requests per window per IP
function rateLimitOk(ip) {
  const now = Date.now();
  const entry = RATE_BUCKETS.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    RATE_BUCKETS.set(ip, { start: now, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= RATE_LIMIT;
}
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS * 2;
  for (const [ip, e] of RATE_BUCKETS) if (e.start < cutoff) RATE_BUCKETS.delete(ip);
}, RATE_WINDOW_MS).unref();

async function serveStatic(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const decoded = decodeURIComponent(url.pathname);
  const safe = path.normalize(decoded).replace(/^[/\\]+/, "");
  if (safe.includes("..")) {
    res.writeHead(403).end();
    return;
  }
  let filePath = path.join(STATIC_DIR, safe);
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403).end();
    return;
  }
  let st;
  try {
    st = await stat(filePath);
    if (st.isDirectory()) {
      filePath = path.join(filePath, "index.html");
      st = await stat(filePath);
    }
  } catch {
    // SPA fallback: any unknown route serves index.html so client-side routing works.
    filePath = path.join(STATIC_DIR, "index.html");
    try {
      st = await stat(filePath);
    } catch {
      res.writeHead(404).end();
      return;
    }
  }

  setBaseHeaders(res);
  const ext = path.extname(filePath).toLowerCase();
  res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
  if ([".jpg", ".jpeg", ".png", ".webp", ".woff2", ".woff", ".ico"].includes(ext)) {
    res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
  } else if (filePath.startsWith(path.join(STATIC_DIR, "data"))) {
    res.setHeader("Cache-Control", "public, max-age=300");
  } else if (filePath.startsWith(path.join(STATIC_DIR, "assets"))) {
    res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
  } else if (ext === ".html") {
    res.setHeader("Cache-Control", "no-cache");
  } else {
    res.setHeader("Cache-Control", "public, max-age=300");
  }
  res.setHeader("Content-Length", st.size);
  res.writeHead(200);
  const data = await readFile(filePath);
  res.end(data);
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const err = new Error("body too large");
      err.code = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const err = new Error("invalid json");
    err.code = 400;
    throw err;
  }
}

function validateChatPayload(payload) {
  if (!payload || typeof payload !== "object") return "bad payload";
  if (!Array.isArray(payload.messages)) return "messages must be an array";
  if (payload.messages.length === 0) return "messages must not be empty";
  if (payload.messages.length > MAX_MESSAGES) return `too many messages (max ${MAX_MESSAGES})`;
  for (const m of payload.messages) {
    if (!m || typeof m !== "object") return "malformed message";
    if (!["system", "user", "assistant"].includes(m.role)) return "invalid role";
    if (typeof m.content !== "string") return "content must be a string";
    if (m.content.length > MAX_MESSAGE_CHARS) return `content too long (max ${MAX_MESSAGE_CHARS})`;
  }
  if (payload.model != null && typeof payload.model !== "string") return "invalid model";
  return null;
}

async function handleChat(req, res) {
  if (req.method === "OPTIONS") {
    setBaseHeaders(res);
    res.setHeader("Allow", "POST, OPTIONS");
    res.writeHead(204).end();
    return;
  }
  if (req.method !== "POST") {
    setBaseHeaders(res);
    res.setHeader("Allow", "POST, OPTIONS");
    res.writeHead(405).end();
    return;
  }
  if (!COHERE_KEY) {
    setBaseHeaders(res);
    res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Cohere proxy not configured (COHERE_API_KEY unset)");
    return;
  }

  const ip = clientIp(req);
  if (!rateLimitOk(ip)) {
    setBaseHeaders(res);
    res.writeHead(429, { "Content-Type": "text/plain", "Retry-After": "60" });
    res.end("rate limit exceeded");
    return;
  }

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    setBaseHeaders(res);
    res.writeHead(err.code || 400, { "Content-Type": "text/plain" });
    res.end(err.message);
    return;
  }
  const reason = validateChatPayload(payload);
  if (reason) {
    setBaseHeaders(res);
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end(reason);
    return;
  }
  const model = ALLOWED_MODELS.has(payload.model) ? payload.model : DEFAULT_MODEL;

  let upstream;
  try {
    upstream = await fetch("https://api.cohere.com/v2/chat", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${COHERE_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      // Command A+ is a reasoning model. Left unbounded, open-ended prompts (e.g.
      // "Tell me more about this satellite") spend a minute+ in the hidden
      // "thinking" phase before any answer text — looking like a hang. Fully
      // disabling reasoning (thinking:{type:"disabled"}) makes the model emit
      // invalid tool calls (422 INVALID_TOOL_GENERATION) for most prompts. So we
      // keep reasoning on but cap it to a small token budget for prompt answers.
      body: JSON.stringify({
        model,
        messages: payload.messages,
        stream: true,
        thinking: { token_budget: 256 },
      }),
    });
  } catch (err) {
    console.error("[chat] upstream fetch failed:", err);
    setBaseHeaders(res);
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("upstream fetch failed");
    return;
  }

  setBaseHeaders(res);
  res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
  res.setHeader("Cache-Control", "no-store");
  // Forward the upstream status (401/429/etc) so the client can react.
  res.writeHead(upstream.status);

  if (!upstream.body) {
    res.end();
    return;
  }
  // Stream chunks straight to the client.
  Readable.fromWeb(upstream.body).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/api/chat") {
    handleChat(req, res).catch((err) => {
      console.error("[chat] error:", err);
      if (!res.headersSent) {
        setBaseHeaders(res);
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("internal error");
      } else {
        try {
          res.end();
        } catch {
          /* ignore */
        }
      }
    });
    return;
  }
  if (url.pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  serveStatic(req, res).catch((err) => {
    console.error("[static] error:", err);
    if (!res.headersSent) res.writeHead(500).end();
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[server] listening on ${HOST}:${PORT}`);
  console.log(`[server] static dir: ${STATIC_DIR}`);
  console.log(`[server] cohere proxy: ${COHERE_KEY ? "enabled" : "disabled (set COHERE_API_KEY)"}`);
});
