import { describe, it, expect } from "vitest";
import { groundTrackPoints, subSatellitePoint } from "../../src/globe/groundTrack";
import { mkSat } from "../factory";

const AT = Date.UTC(2020, 0, 29, 13, 0, 0); // near the ISS TLE epoch

describe("groundTrackPoints", () => {
  it("returns sampled geodetic points for a valid TLE", () => {
    const pts = groundTrackPoints(mkSat(), AT, 60);
    expect(pts.length).toBeGreaterThan(50);
    for (const p of pts) {
      expect(p.lat).toBeGreaterThanOrEqual(-90);
      expect(p.lat).toBeLessThanOrEqual(90);
      expect(p.lon).toBeGreaterThanOrEqual(-180);
      expect(p.lon).toBeLessThanOrEqual(180);
    }
  });

  it("stays within the satellite's inclination band", () => {
    const pts = groundTrackPoints(mkSat({ inclinationDeg: 51.6 }), AT, 90);
    const maxLat = Math.max(...pts.map((p) => Math.abs(p.lat)));
    expect(maxLat).toBeLessThan(55); // ISS never goes far past ~51.6°
  });

  it("returns [] for an unparseable TLE", () => {
    expect(groundTrackPoints(mkSat({ tleLine1: "garbage", tleLine2: "junk" }), AT)).toEqual([]);
  });
});

describe("subSatellitePoint", () => {
  it("returns a single current point for a valid TLE", () => {
    const p = subSatellitePoint(mkSat(), AT);
    expect(p).not.toBeNull();
    expect(typeof p!.lat).toBe("number");
    expect(typeof p!.lon).toBe("number");
  });

  it("returns null for an unparseable TLE", () => {
    expect(subSatellitePoint(mkSat({ tleLine1: "x", tleLine2: "y" }), AT)).toBeNull();
  });
});
