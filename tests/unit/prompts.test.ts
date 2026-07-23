import { describe, it, expect } from "vitest";
import { buildDynamicPrompts, buildSystemPrompt } from "../../src/agent/prompts";
import { mkSat } from "../factory";

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
});
