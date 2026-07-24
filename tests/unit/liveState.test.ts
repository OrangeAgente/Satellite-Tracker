import { describe, it, expect } from "vitest";
import { computeLiveState } from "../../src/agent/liveState";
import { DEFAULT_OBSERVER } from "../../src/passes/predictor";
import { mkSat } from "../factory";

const AT = Date.UTC(2020, 0, 29, 13, 0, 0); // near the ISS TLE epoch

describe("computeLiveState", () => {
  it("returns real SGP4 state for a valid TLE (ISS)", () => {
    const s = computeLiveState(mkSat(), DEFAULT_OBSERVER, AT);
    expect(s).not.toBeNull();
    expect(s!.latDeg).toBeGreaterThanOrEqual(-90);
    expect(s!.latDeg).toBeLessThanOrEqual(90);
    expect(s!.lonDeg).toBeGreaterThanOrEqual(-180);
    expect(s!.lonDeg).toBeLessThanOrEqual(180);
    // ISS ~400 km altitude, ~7.66 km/s
    expect(s!.altKm).toBeGreaterThan(300);
    expect(s!.altKm).toBeLessThan(600);
    expect(s!.speedKmS).toBeGreaterThan(7);
    expect(s!.speedKmS).toBeLessThan(8.2);
    expect(["sunlit", "eclipsed"]).toContain(s!.illumination);
    expect(s!.observer).toEqual(DEFAULT_OBSERVER);
    expect(Array.isArray(s!.passes)).toBe(true);
  });

  it("stays within the ISS inclination band", () => {
    const s = computeLiveState(mkSat({ inclinationDeg: 51.6 }), DEFAULT_OBSERVER, AT);
    expect(Math.abs(s!.latDeg)).toBeLessThan(55);
  });

  it("returns null for an unparseable TLE", () => {
    expect(computeLiveState(mkSat({ tleLine1: "x", tleLine2: "y" }), DEFAULT_OBSERVER, AT)).toBeNull();
  });
});
