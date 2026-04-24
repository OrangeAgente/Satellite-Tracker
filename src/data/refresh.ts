import type { PropagationClient } from "../propagation/propagationClient";

const CELESTRAK_ACTIVE_TLE = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=TLE";

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
  onRefresh: (stamp: string) => void,
  intervalMs = 2 * 60_000,
): () => void {
  let stopped = false;
  async function run() {
    if (stopped) return;
    try {
      const res = await fetch(CELESTRAK_ACTIVE_TLE, { cache: "no-cache" });
      if (res.ok) {
        const text = await res.text();
        const parsed = parseTleText(text);
        if (parsed.length) {
          client.updateTles(parsed);
          onRefresh(new Date().toLocaleTimeString());
        }
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
