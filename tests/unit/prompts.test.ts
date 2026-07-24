import { describe, it, expect } from "vitest";
import { buildDynamicPrompts, buildSystemPrompt } from "../../src/agent/prompts";
import type { LiveState } from "../../src/agent/liveState";
import { mkSat } from "../factory";

const LIVE: LiveState = {
  atMs: Date.UTC(2026, 6, 24, 12, 0, 0),
  latDeg: 12.34,
  lonDeg: -45.67,
  altKm: 418,
  speedKmS: 7.66,
  illumination: "sunlit",
  observer: { latDeg: 37.77, lonDeg: -122.42, altKm: 0.05 },
  look: { elevationDeg: 23, azimuthDeg: 145, rangeKm: 1180 },
  passes: [
    {
      noradId: 25544,
      name: "ISS",
      aos: new Date(Date.UTC(2026, 6, 24, 14, 32, 0)),
      los: new Date(Date.UTC(2026, 6, 24, 14, 41, 0)),
      maxElDeg: 47,
      aosAzDeg: 45,
      losAzDeg: 200,
    },
  ],
};

describe("buildDynamicPrompts", () => {
  it("adds a Starlink prompt for starlink-category objects", () => {
    const p = buildDynamicPrompts(mkSat({ categories: ["starlink"] }));
    expect(p.some((s) => /Starlink constellation/i.test(s))).toBe(true);
  });

  it("adds a GEO slot prompt for GEO objects", () => {
    const p = buildDynamicPrompts(mkSat({ orbitClass: "GEO" }));
    expect(p.some((s) => /slot longitude/i.test(s))).toBe(true);
  });

  it("asks who's aboard for the ISS", () => {
    const p = buildDynamicPrompts(mkSat({ name: "ISS (ZARYA)", categories: ["stations"] }));
    expect(p.some((s) => /aboard/i.test(s))).toBe(true);
  });

  it("adds a debris-origin prompt for debris", () => {
    const p = buildDynamicPrompts(mkSat({ objectType: "DEB" }));
    expect(p.some((s) => /debris/i.test(s))).toBe(true);
  });
});

describe("buildSystemPrompt", () => {
  it("embeds the satellite's identity and orbital facts", () => {
    const sys = buildSystemPrompt(
      mkSat({ noradId: 25544, name: "ISS (ZARYA)", inclinationDeg: 51.64, orbitClass: "LEO" }),
    );
    expect(sys).toContain("SATCOM·OPS");
    expect(sys).toContain("ISS (ZARYA)");
    expect(sys).toContain("25544");
    expect(sys).toContain("51.64");
  });

  it("includes UCS metadata when present", () => {
    const sys = buildSystemPrompt(mkSat({ ucs: { operator: "SpaceX", users: "Commercial" } }));
    expect(sys).toContain("UCS METADATA");
    expect(sys).toContain("SpaceX");
  });

  it("omits the LIVE STATE block when no live state is given", () => {
    expect(buildSystemPrompt(mkSat())).not.toContain("LIVE STATE");
  });

  it("appends a LIVE STATE block with position, altitude and passes", () => {
    const sys = buildSystemPrompt(mkSat(), LIVE);
    expect(sys).toContain("LIVE STATE");
    expect(sys).toContain("sub-satellite point: 12.34°N, 45.67°W");
    expect(sys).toContain("altitude: 418 km");
    expect(sys).toContain("illumination: sunlit");
    expect(sys).toContain("23° above the horizon");
    expect(sys).toContain("max el 47°");
  });

  it("renders pass times in the browser's local timezone, not UTC", () => {
    const sys = buildSystemPrompt(mkSat(), LIVE);
    expect(sys).toContain("local timezone");
    // "HH:MM → HH:MM, max el 47°" with no " UTC" between the time and the arrow
    expect(sys).toMatch(/\d\d:\d\d → \d\d:\d\d, max el 47°/);
  });
});
