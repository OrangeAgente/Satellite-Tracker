import type { Satellite } from "../types";

export type UsageBucket = "Civil" | "Commercial" | "Government" | "Military";

const MILITARY_HINTS = [
  "military",
  "x-comm",
  "intel-ops",
  "cosmos",
  "uss-",
  "usa-",
  "nrol",
  "milstar",
  "wgs",
  "dscs",
  "sbirs",
  "lacrosse",
  "topaz",
];

const GOV_GROUPS = new Set([
  "weather",
  "noaa",
  "goes",
  "resource",
  "sarsat",
  "dmc",
  "tdrss",
  "argos",
  "gps-ops",
  "glo-ops",
  "galileo",
  "beidou",
  "sbas",
  "nnss",
  "musson",
  "science",
  "geodetic",
  "engineering",
  "education",
  "stations",
  "visual",
]);

const COMMERCIAL_GROUPS = new Set([
  "starlink",
  "oneweb",
  "iridium",
  "iridium-NEXT",
  "globalstar",
  "intelsat",
  "ses",
  "planet",
  "spire",
  "gorizont",
  "raduga",
  "molniya",
  "amateur",
  "x-comm",
  "other-comm",
  "satnogs",
  "orbcomm",
  "geo",
  "cubesat",
]);

const MILITARY_COUNTRIES = new Set([
  "USA-MIL",
  "PRC-MIL",
  "RUS-MIL",
]);

export function inferUsage(sat: Satellite): Set<UsageBucket> {
  const out = new Set<UsageBucket>();

  // 1) Trust UCS metadata when present.
  const ucsUsers = (sat.ucs?.users || "").toLowerCase();
  if (ucsUsers) {
    if (ucsUsers.includes("military")) out.add("Military");
    if (ucsUsers.includes("government")) out.add("Government");
    if (ucsUsers.includes("commercial")) out.add("Commercial");
    if (ucsUsers.includes("civil")) out.add("Civil");
    if (out.size > 0) return out;
  }

  const cats = sat.categories;
  const nameLower = sat.name.toLowerCase();

  if (cats.includes("military") || MILITARY_HINTS.some((h) => nameLower.includes(h))) {
    out.add("Military");
  }
  if (sat.country && MILITARY_COUNTRIES.has(sat.country)) out.add("Military");

  for (const c of cats) {
    if (GOV_GROUPS.has(c)) out.add("Government");
    if (COMMERCIAL_GROUPS.has(c)) out.add("Commercial");
  }

  if (cats.includes("amateur") || cats.includes("education") || cats.includes("cubesat")) {
    out.add("Civil");
  }

  // Last-resort fallback so rocket bodies / debris / unclassified still bucket.
  if (out.size === 0) {
    if (sat.objectType === "PAY") out.add("Commercial");
    else out.add("Civil");
  }

  return out;
}

export function matchesUsage(sat: Satellite, want: Set<string>): boolean {
  if (want.size === 0) return true;
  const buckets = inferUsage(sat);
  for (const w of want) {
    if (buckets.has(w as UsageBucket)) return true;
  }
  return false;
}
