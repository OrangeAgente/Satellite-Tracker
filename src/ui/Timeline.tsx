import { useMemo, useRef } from "react";
import { useApp } from "../store";
import type { PlayRate } from "../store";
import { useSimClock } from "../hooks/useSimClock";

const SPEEDS: PlayRate[] = [0.5, 1, 2, 4, 16, 64];
const WINDOW_MS = 4 * 60 * 60 * 1000;

export function Timeline() {
  const playing = useApp((s) => s.playing);
  const setPlaying = useApp((s) => s.setPlaying);
  const playRate = useApp((s) => s.playRate);
  const setPlayRate = useApp((s) => s.setPlayRate);
  const simTime = useApp((s) => s.simTime);
  const setSimTime = useApp((s) => s.setSimTime);

  const trackRef = useRef<HTMLDivElement>(null);

  // Advance simTime forward while in sim mode + playing.
  useSimClock();

  const now = Date.now();
  const display = simTime ?? now;
  const offsetFromNow = display - now;
  const progress = clamp((offsetFromNow + WINDOW_MS) / (WINDOW_MS * 2), 0, 1);
  const fillLeft = Math.min(progress, 0.5);
  const fillWidth = Math.abs(progress - 0.5);

  const ticks = useMemo(() => {
    const out: { left: number; label: string }[] = [];
    for (let h = -4; h <= 4; h++) {
      const x = (h + 4) / 8;
      const sign = h > 0 ? "+" : "";
      out.push({ left: x, label: h === 0 ? "NOW" : `${sign}${h}h` });
    }
    return out;
  }, []);

  const dropToSim = (t: number) => {
    setSimTime(t);
    if (!playing) setPlaying(true);
  };

  const togglePlay = () => {
    if (simTime == null) {
      // Live mode → freeze at current wall clock
      setSimTime(Date.now());
      setPlaying(false);
    } else {
      setPlaying(!playing);
    }
  };

  const onScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const t = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const off = (t - 0.5) * 2 * WINDOW_MS;
    setSimTime(Date.now() + off);
  };

  const skip = (deltaMs: number) => dropToSim((simTime ?? Date.now()) + deltaMs);

  const setRate = (r: PlayRate) => {
    if (simTime == null) setSimTime(Date.now());
    setPlayRate(r);
  };

  const goLive = () => {
    setSimTime(null);
    setPlaying(true);
  };

  const isLive = simTime == null;
  const playGlyph = isLive ? "⏵" : playing ? "❚❚" : "▶";

  return (
    <div className="ops-scrubber">
      <button onClick={() => skip(-5 * 60_000)} title="-5 min">«</button>
      <button className="ops-play" onClick={togglePlay} title={isLive ? "Freeze" : playing ? "Pause" : "Play"}>
        {playGlyph}
      </button>
      <button onClick={() => skip(5 * 60_000)} title="+5 min">»</button>

      <div className="ops-scrub-track" ref={trackRef} onClick={onScrub}>
        <div className="ops-scrub-fill" style={{ left: `${fillLeft * 100}%`, width: `${fillWidth * 100}%` }} />
        {ticks.map((t, i) => (
          <span key={i} className="ops-scrub-tick" style={{ left: `${t.left * 100}%` }}>
            {t.label}
          </span>
        ))}
        <div className="ops-scrub-now" style={{ left: `${progress * 100}%` }} />
      </div>

      <div className="ops-speed">
        {SPEEDS.map((s) => (
          <button key={s} className={playRate === s ? "on" : ""} onClick={() => setRate(s)}>
            {s}×
          </button>
        ))}
      </div>

      <button className={isLive ? "on" : ""} onClick={goLive}>NOW</button>
      <span className={"telem" + (isLive ? " hot" : "")}>
        <span className="telem-k">SIM</span>
        <span className="telem-v">{isLive ? "LIVE" : formatOffset(offsetFromNow)}</span>
      </span>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function formatOffset(ms: number) {
  const sign = ms < 0 ? "-" : "+";
  const a = Math.abs(ms);
  const h = Math.floor(a / 3_600_000);
  const m = Math.floor((a % 3_600_000) / 60_000);
  return `${sign}${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}
