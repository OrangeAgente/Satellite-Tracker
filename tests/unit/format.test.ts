import { describe, it, expect } from "vitest";
import { fmtPeriod, fmtUTC, fmtLocalHMS, fmtOffset, orbitColor } from "../../src/mobile/format";

describe("fmtPeriod", () => {
  it("shows minutes for short orbits", () => {
    expect(fmtPeriod(95)).toBe("95 m");
  });
  it("shows hours for long orbits", () => {
    expect(fmtPeriod(1436)).toBe("23.9 h");
  });
  it("handles unknown", () => {
    expect(fmtPeriod(null)).toBe("—");
    expect(fmtPeriod(undefined)).toBe("—");
  });
});

describe("fmtUTC", () => {
  it("formats a timestamp as UTC YYYY-MM-DD HH:MM:SS", () => {
    expect(fmtUTC(Date.UTC(2026, 6, 23, 3, 5, 9))).toBe("2026-07-23 03:05:09");
  });
});

describe("fmtLocalHMS", () => {
  it("zero-pads local hours/minutes/seconds", () => {
    const d = new Date(2026, 0, 1, 4, 2, 7);
    expect(fmtLocalHMS(d)).toBe("04:02:07");
  });
});

describe("fmtOffset", () => {
  it("formats signed HH:MM offsets", () => {
    expect(fmtOffset(0)).toBe("+00:00");
    expect(fmtOffset(90 * 60_000)).toBe("+01:30");
    expect(fmtOffset(-90 * 60_000)).toBe("-01:30");
  });
});

describe("orbitColor", () => {
  it("maps each orbit class to a color and falls back to UNK", () => {
    expect(orbitColor("LEO")).toBe("#5cd0ff");
    expect(orbitColor("GEO")).toBe("#ffc846");
    expect(orbitColor("UNK")).toBe("#6b7280");
  });
});
