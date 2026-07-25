import { useEffect } from "react";
import { useApp } from "../store";

/**
 * Advances `simTime` forward while in sim mode and playing, scaled by
 * `playRate`. Uses a wall-clock base so changing the rate or pausing/resuming
 * doesn't drift. Mount this once in whichever layout is active (desktop
 * Timeline or the mobile shell).
 *
 * Ticks at 10 Hz rather than once per animation frame: `simTime` lives in the
 * store, so every write re-renders each subscriber (on mobile that's the whole
 * shell — sheet, panels, ground track). A 60 Hz write rate bought nothing,
 * because the only consumers are text readouts and the scrubber cursor, and
 * the propagation worker samples time at 4 Hz anyway. The globe itself stays
 * smooth: it reads time imperatively inside useFrame, not via subscription.
 */
const TICK_MS = 100;

export function useSimClock(): void {
  const playing = useApp((s) => s.playing);
  const playRate = useApp((s) => s.playRate);
  const running = useApp((s) => s.simTime != null);

  useEffect(() => {
    if (!running || !playing) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const elapsed = now - last;
      last = now;
      // Advance from the CURRENT store value rather than a base captured when
      // the effect started, so scrubbing mid-playback isn't immediately undone.
      // `elapsed` is measured, so this tracks wall clock without drifting.
      const cur = useApp.getState().simTime;
      if (cur == null) return;
      useApp.setState({ simTime: cur + elapsed * playRate });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [playing, playRate, running]);
}
