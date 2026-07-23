import { describe, it, expect, beforeEach } from "vitest";
import { computeVisibleIds, useApp } from "../../src/store";
import { mkDataset, mkFilters, mkSat } from "../factory";

type VisibleState = Parameters<typeof computeVisibleIds>[0];

const sats = [
  mkSat({ noradId: 1, name: "STARLINK-1", orbitClass: "LEO", objectType: "PAY", ucs: { users: "Commercial" } }),
  mkSat({ noradId: 2, name: "GPS-2", orbitClass: "GEO", objectType: "PAY", ucs: { users: "Government" } }),
  mkSat({ noradId: 3, name: "DEBRIS-3", orbitClass: "LEO", objectType: "DEB", ucs: { users: "Military" } }),
];
const ds = mkDataset(sats);

function visible(filters = mkFilters(), searchQuery = ""): Set<number> {
  return computeVisibleIds({ dataset: ds, filters, searchQuery } as VisibleState);
}

describe("computeVisibleIds", () => {
  it("returns all satellites with no filters", () => {
    expect(visible()).toEqual(new Set([1, 2, 3]));
  });

  it("filters by orbit class", () => {
    expect(visible(mkFilters({ orbitClasses: new Set(["LEO"]) }))).toEqual(new Set([1, 3]));
  });

  it("filters by object type", () => {
    expect(visible(mkFilters({ objectTypes: new Set(["DEB"]) }))).toEqual(new Set([3]));
  });

  it("filters by usage bucket (from UCS metadata)", () => {
    expect(visible(mkFilters({ users: new Set(["Commercial"]) }))).toEqual(new Set([1]));
    expect(visible(mkFilters({ users: new Set(["Military"]) }))).toEqual(new Set([3]));
  });

  it("intersects multiple filter dimensions", () => {
    const f = mkFilters({ orbitClasses: new Set(["LEO"]), objectTypes: new Set(["PAY"]) });
    expect(visible(f)).toEqual(new Set([1]));
  });

  it("filters by search over name", () => {
    expect(visible(mkFilters(), "gps")).toEqual(new Set([2]));
  });

  it("returns empty when nothing matches", () => {
    expect(visible(mkFilters({ orbitClasses: new Set(["HEO"]) }))).toEqual(new Set());
  });
});

describe("store actions", () => {
  beforeEach(() => {
    useApp.setState({ filters: mkFilters(), pinnedIds: [], selectedId: null });
  });

  it("toggleFilter adds then removes a value", () => {
    useApp.getState().toggleFilter("orbitClasses", "LEO");
    expect(useApp.getState().filters.orbitClasses.has("LEO")).toBe(true);
    useApp.getState().toggleFilter("orbitClasses", "LEO");
    expect(useApp.getState().filters.orbitClasses.has("LEO")).toBe(false);
  });

  it("togglePin adds then removes an id", () => {
    useApp.getState().togglePin(42);
    expect(useApp.getState().pinnedIds).toContain(42);
    useApp.getState().togglePin(42);
    expect(useApp.getState().pinnedIds).not.toContain(42);
  });

  it("clearAllFilters resets every dimension", () => {
    const s = useApp.getState();
    s.toggleFilter("orbitClasses", "LEO");
    s.toggleFilter("users", "Civil");
    useApp.getState().clearAllFilters();
    const f = useApp.getState().filters;
    expect(f.orbitClasses.size).toBe(0);
    expect(f.users.size).toBe(0);
  });
});
