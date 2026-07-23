import type { Dataset, FilterState, Satellite } from "../src/types";

// A real historical ISS TLE — valid enough for satellite.js to parse/propagate.
export const ISS_TLE1 = "1 25544U 98067A   20029.51782528  .00016717  00000-0  10270-3 0  9006";
export const ISS_TLE2 = "2 25544  51.6392  56.5754 0005156 137.5720  23.7654 15.49183028 10746";

export function mkSat(o: Partial<Satellite> = {}): Satellite {
  return {
    noradId: 1,
    name: "TEST SAT",
    intlDes: "2020-999A",
    objectType: "PAY",
    country: "USA",
    tleLine1: ISS_TLE1,
    tleLine2: ISS_TLE2,
    categories: [],
    orbitClass: "LEO",
    periodMin: 95,
    inclinationDeg: 53,
    apogeeKm: 550,
    perigeeKm: 540,
    launchDate: "2020-01-01",
    ...o,
  };
}

export function mkFilters(p: Partial<FilterState> = {}): FilterState {
  return {
    users: new Set(),
    countries: new Set(),
    orbitClasses: new Set(),
    categories: new Set(),
    objectTypes: new Set(),
    ...p,
  };
}

export function mkDataset(sats: Satellite[]): Dataset {
  return { generatedAt: "", count: sats.length, categoryGroups: [], satellites: sats };
}
