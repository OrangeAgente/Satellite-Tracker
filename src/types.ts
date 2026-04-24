export type OrbitClass = "LEO" | "MEO" | "GEO" | "HEO" | "UNK";

export interface UcsFields {
  users?: string;
  purpose?: string;
  detailedPurpose?: string;
  operatorCountry?: string;
  operator?: string;
  contractor?: string;
  contractorCountry?: string;
  launchMassKg?: string;
  dryMassKg?: string;
  powerW?: string;
  expectedLifetimeYears?: string;
  launchSite?: string;
  launchVehicle?: string;
}

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
  ucs?: UcsFields;
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
