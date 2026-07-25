import type { PropagationClient } from "../propagation/propagationClient";

// Same-origin proxy (server/server.js) rather than celestrak.org directly: the
// deployed CSP is `connect-src 'self'`, so a direct fetch is blocked and the
// refresh silently never ran. The server caches upstream for an hour.
const TLE_URL = "/api/tle";

interface ParsedTle {
  noradId: number;
  tleLine1: string;
  tleLine2: string;
}

export function parseTleText(text: string): ParsedTle[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  const out: ParsedTle[] = [];
  for (let i = 0; i < lines.length - 2; i += 3) {
    const l1 = lines[i + 1];
    const l2 = lines[i + 2];
    if (!l1?.startsWith("1 ") || !l2?.startsWith("2 ")) continue;
    const norad = Number(l1.slice(2, 7).trim());
    if (!Number.isFinite(norad)) continue;
    out.push({ noradId: norad, tleLine1: l1, tleLine2: l2 });
  }
  return out;
}

export function startLiveRefresh(
  client: PropagationClient,
  onRefresh: (at: number) => void,
  // TLEs are re-issued a few times a day at most, and the server caches for an
  // hour — polling harder just burns bandwidth (and CelesTrak asks us not to).
  intervalMs = 30 * 60_000,
): () => void {
  let stopped = false;
  async function run() {
    if (stopped) return;
    try {
      const res = await fetch(TLE_URL);
      if (res.ok) {
        const text = await res.text();
        const parsed = parseTleText(text);
        if (parsed.length) {
          client.updateTles(parsed);
          onRefresh(Date.now());
        }
      } else {
        console.warn(`[refresh] TLE fetch failed: HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn("[refresh] live TLE fetch failed:", err);
    }
  }
  const timer = window.setInterval(run, intervalMs);
  // Kick off an initial refresh after a short delay (post-boot).
  window.setTimeout(run, 10_000);
  return () => {
    stopped = true;
    window.clearInterval(timer);
  };
}
