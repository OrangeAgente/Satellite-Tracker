import { useEffect, useRef } from "react";
import { useApp } from "../store";

/**
 * Advances `simTime` forward while in sim mode and playing, scaled by
 * `playRate`. Uses a wall-clock base so changing the rate or pausing/resuming
 * doesn't drift. Mount this once in whichever layout is active (desktop
 * Timeline or the mobile shell).
 */
export function useSimClock(): void {
  const playing = useApp((s) => s.playing);
  const playRate = useApp((s) => s.playRate);
  const simTime = useApp((s) => s.simTime);

  const baseRef = useRef<{ wall: number; sim: number } | null>(null);

  useEffect(() => {
    if (simTime == null || !playing) {
      baseRef.current = null;
      return;
    }
    baseRef.current = { wall: performance.now(), sim: simTime };
    let raf = 0;
    const step = () => {
      const base = baseRef.current;
      if (!base) return;
      const next = base.sim + (performance.now() - base.wall) * playRate;
      useApp.setState({ simTime: next });
      raf = window.requestAnimationFrame(step);
    };
    raf = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, playRate, simTime != null]);
}
