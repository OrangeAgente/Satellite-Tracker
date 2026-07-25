import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSimClock } from "../../src/hooks/useSimClock";
import { useApp } from "../../src/store";

const T0 = Date.UTC(2026, 6, 25, 12, 0, 0);

describe("useSimClock", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance", "Date"] });
    useApp.setState({ simTime: null, playing: true, playRate: 1 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing in live mode (simTime null)", () => {
    renderHook(() => useSimClock());
    vi.advanceTimersByTime(1000);
    expect(useApp.getState().simTime).toBeNull();
  });

  it("does nothing while paused", () => {
    useApp.setState({ simTime: T0, playing: false });
    renderHook(() => useSimClock());
    vi.advanceTimersByTime(1000);
    expect(useApp.getState().simTime).toBe(T0);
  });

  it("advances in real time at 1x", () => {
    useApp.setState({ simTime: T0, playing: true, playRate: 1 });
    renderHook(() => useSimClock());
    vi.advanceTimersByTime(1000);
    expect(useApp.getState().simTime).toBeCloseTo(T0 + 1000, -2);
  });

  it("scales with playRate", () => {
    useApp.setState({ simTime: T0, playing: true, playRate: 64 });
    renderHook(() => useSimClock());
    vi.advanceTimersByTime(1000);
    // 1s of wall clock at 64x => ~64s of sim time
    expect(useApp.getState().simTime).toBeCloseTo(T0 + 64_000, -3);
  });

  it("ticks at ~10Hz, not once per frame (bounded re-renders)", () => {
    useApp.setState({ simTime: T0, playing: true, playRate: 1 });
    let writes = 0;
    const unsub = useApp.subscribe(() => {
      writes += 1;
    });
    renderHook(() => useSimClock());
    vi.advanceTimersByTime(1000);
    unsub();
    // 10Hz => ~10 writes/sec. A 60Hz RAF loop would be ~60.
    expect(writes).toBeGreaterThan(5);
    expect(writes).toBeLessThan(20);
  });

  it("respects a scrub mid-playback instead of overwriting it", () => {
    useApp.setState({ simTime: T0, playing: true, playRate: 1 });
    renderHook(() => useSimClock());
    vi.advanceTimersByTime(500);

    // User drags the scrubber an hour forward while playing.
    const scrubbed = T0 + 3_600_000;
    useApp.setState({ simTime: scrubbed });
    vi.advanceTimersByTime(500);

    // Clock continues FROM the scrubbed position, not from the old base.
    expect(useApp.getState().simTime).toBeGreaterThanOrEqual(scrubbed);
    expect(useApp.getState().simTime).toBeLessThan(scrubbed + 2000);
  });

  it("stops when unmounted", () => {
    useApp.setState({ simTime: T0, playing: true, playRate: 1 });
    const { unmount } = renderHook(() => useSimClock());
    vi.advanceTimersByTime(300);
    unmount();
    const frozen = useApp.getState().simTime;
    vi.advanceTimersByTime(1000);
    expect(useApp.getState().simTime).toBe(frozen);
  });
});
