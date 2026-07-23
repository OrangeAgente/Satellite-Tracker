import { describe, it, expect } from "vitest";
import { compassDir, pickPassPool } from "../../src/passes/predictor";
import { mkSat } from "../factory";

describe("compassDir", () => {
  it("maps azimuths to 8-point compass headings", () => {
    expect(compassDir(0)).toBe("N");
    expect(compassDir(90)).toBe("E");
    expect(compassDir(180)).toBe("S");
    expect(compassDir(270)).toBe("W");
    expect(compassDir(45)).toBe("NE");
    expect(compassDir(360)).toBe("N");
    expect(compassDir(-90)).toBe("W");
  });
});

describe("pickPassPool", () => {
  const sats = [
    mkSat({ noradId: 100, name: "STARLINK-1007", orbitClass: "LEO", objectType: "PAY" }),
    mkSat({ noradId: 25544, name: "ISS (ZARYA)", orbitClass: "LEO", objectType: "PAY" }),
    mkSat({ noradId: 20580, name: "HST (HUBBLE)", orbitClass: "LEO", objectType: "PAY" }),
    mkSat({ noradId: 900, name: "RANDOM LEO", orbitClass: "LEO", objectType: "PAY" }),
    mkSat({ noradId: 800, name: "SOME GEO", orbitClass: "GEO", objectType: "PAY" }),
  ];

  it("prioritizes known bright objects (ISS, Hubble, Starlink)", () => {
    const pool = pickPassPool(sats, 3);
    const names = pool.map((s) => s.name);
    expect(names).toContain("ISS (ZARYA)");
    expect(names).toContain("HST (HUBBLE)");
    expect(names).toContain("STARLINK-1007");
  });

  it("respects the requested pool size", () => {
    expect(pickPassPool(sats, 2).length).toBe(2);
  });

  it("backfills with LEO payloads and skips non-LEO", () => {
    const pool = pickPassPool(sats, 5);
    expect(pool.every((s) => s.orbitClass === "LEO")).toBe(true);
    expect(pool.map((s) => s.noradId)).not.toContain(800); // the GEO is excluded
  });
});
