import { useRef } from "react";
import { useApp } from "../store";
import type { PlayRate } from "../store";
import { fmtOffset } from "./format";

const SPEEDS: PlayRate[] = [0.5, 1, 2, 4, 16, 64];
const WINDOW_MS = 4 * 60 * 60 * 1000;
const TICKS = [-4, -2, 0, 2, 4];

export function TimelineSheet({ onClose }: { onClose: () => void }) {
  const playing = useApp((s) => s.playing);
  const setPlaying = useApp((s) => s.setPlaying);
  const playRate = useApp((s) => s.playRate);
  const setPlayRate = useApp((s) => s.setPlayRate);
  const simTime = useApp((s) => s.simTime);
  const setSimTime = useApp((s) => s.setSimTime);
  const trackRef = useRef<HTMLDivElement>(null);

  const isLive = simTime == null;
  const now = Date.now();
  const offsetFromNow = (simTime ?? now) - now;
  const progress = clamp((offsetFromNow + WINDOW_MS) / (WINDOW_MS * 2), 0, 1);

  const dropToSim = (t: number) => {
    setSimTime(t);
    if (!playing) setPlaying(true);
  };
  const skip = (deltaMs: number) => dropToSim((simTime ?? Date.now()) + deltaMs);

  const togglePlay = () => {
    if (isLive) {
      setSimTime(Date.now());
      setPlaying(false);
    } else {
      setPlaying(!playing);
    }
  };

  const setRate = (r: PlayRate) => {
    if (isLive) setSimTime(Date.now());
    setPlayRate(r);
  };

  const goLive = () => {
    setSimTime(null);
    setPlaying(true);
  };

  const scrub = (e: React.MouseEvent | React.TouchEvent) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const x = clamp((clientX - rect.left) / rect.width, 0, 1);
    setSimTime(Date.now() + (x - 0.5) * 2 * WINDOW_MS);
  };

  const playGlyph = isLive ? "⏵" : playing ? "❚❚" : "▶";

  return (
    <>
      <div className="m-scrim" onClick={onClose} />
      <section className="m-timeline">
        <button className="m-handle" onClick={onClose}><span /></button>
        <div className="m-panel-h">
          <span>Timeline · SIM {isLive ? "LIVE" : fmtOffset(offsetFromNow)}</span>
          <button className={"m-clear" + (isLive ? " on" : "")} onClick={goLive}>LIVE</button>
        </div>

        <div className="m-tl-controls">
          <button onClick={() => skip(-5 * 60_000)}>«</button>
          <button className="play" onClick={togglePlay}>{playGlyph}</button>
          <button onClick={() => skip(5 * 60_000)}>»</button>
        </div>

        <div className="m-tl-track" ref={trackRef} onClick={scrub} onTouchMove={scrub}>
          <div
            className="fill"
            style={{ left: Math.min(progress, 0.5) * 100 + "%", width: Math.abs(progress - 0.5) * 100 + "%" }}
          />
          {TICKS.map((h) => (
            <span key={h} className="tick" style={{ left: ((h + 4) / 8) * 100 + "%" }}>
              {h === 0 ? "NOW" : (h > 0 ? "+" : "") + h + "h"}
            </span>
          ))}
          <div className="cursor" style={{ left: progress * 100 + "%" }} />
        </div>

        <div className="m-tl-speed">
          {SPEEDS.map((r) => (
            <button key={r} className={playRate === r ? "on" : ""} onClick={() => setRate(r)}>{r}×</button>
          ))}
        </div>
      </section>
    </>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
