export type OrbitClass = "LEO" | "MEO" | "GEO" | "HEO" | "UNK";

export interface Satellite {
  noradId: number;
  name: string;
  intlDes: string;
  objectType: string; // PAY | R/B | DEB | UNK
  country: string;
  tleLine1: string;
  tleLine2: string;
  categories: string[];
  orbitClass: OrbitClass;
  periodMin: number | null;
  inclinationDeg: number | null;
  apogeeKm: number | null;
  perigeeKm: number | null;
  launchDate: string;

  // Optional enrichment, present only when the upstream catalogs know it.
  // launchSite/opsStatus/sizeClass/decayDate come from CelesTrak SATCAT;
  // launchVehicle/operator are joined from Wikidata on the COSPAR designator.
  launchSite?: string;
  opsStatus?: string;
  sizeClass?: string;
  rcsM2?: number;
  decayDate?: string;
  launchVehicle?: string;
  operator?: string;
}

export interface Dataset {
  generatedAt: string;
  count: number;
  categoryGroups: string[];
  satellites: Satellite[];
}

export interface FilterState {
  users: Set<string>;
  countries: Set<string>;
  orbitClasses: Set<OrbitClass>;
  categories: Set<string>;
  objectTypes: Set<string>;
}
