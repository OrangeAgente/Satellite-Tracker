#!/usr/bin/env node
/**
 * Build the static satellite dataset by fetching, merging, and writing:
 *   - CelesTrak GP (TLE/OMM) data for the active catalog and per-category groups
 *   - CelesTrak SATCAT (satellite catalog) for universal coverage incl. debris
 *
 * Output:
 *   public/data/satellites.json  — merged records keyed by NORAD id
 *   public/data/tle.txt          — fresh TLE lines for all active objects
 *   public/data/build-info.json  — counts + timestamp
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "data");

const CELESTRAK_BASE = "https://celestrak.org/NORAD/elements/gp.php";
const SATCAT_URL = "https://celestrak.org/pub/satcat.csv";

// CelesTrak category groups we track. Each satellite inherits the list of groups it appears in.
const CATEGORY_GROUPS = [
  "active",
  "stations",
  "visual",
  "weather",
  "noaa",
  "goes",
  "resource",
  "sarsat",
  "dmc",
  "tdrss",
  "argos",
  "planet",
  "spire",
  "geo",
  "intelsat",
  "ses",
  "iridium",
  "iridium-NEXT",
  "starlink",
  "oneweb",
  "orbcomm",
  "globalstar",
  "swarm",
  "amateur",
  "x-comm",
  "other-comm",
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
  "military",
  "radar",
  "cubesat",
  "other",
  // Debris and rocket-body clouds — surfaces DEB / R/B objects in the catalog.
  "cosmos-2251-debris",
  "iridium-33-debris",
  "1999-025",
  "2012-044",
  "2019-006",
  "2021-022",
  "last-30-days",
];

const USER_AGENT = "satellite-tracker/0.1 (+https://github.com/orangeagente/satellite-tracker)";

async function fetchWithRetry(url, init = {}, { retries = 3, timeoutMs = 45_000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: { "user-agent": USER_AGENT, ...(init.headers || {}) },
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) {
        const delay = 1000 * 2 ** attempt;
        console.warn(`[fetch] ${url} failed (${err.message}); retrying in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

async function fetchGroupJson(group) {
  const url = `${CELESTRAK_BASE}?GROUP=${encodeURIComponent(group)}&FORMAT=JSON`;
  const res = await fetchWithRetry(url);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    // CelesTrak sometimes returns "No GP data found" as plain text for empty groups.
    console.warn(`[celestrak] Group "${group}" returned non-JSON (${text.slice(0, 80)}...)`);
    return [];
  }
}

async function fetchSatcat() {
  const res = await fetchWithRetry(SATCAT_URL);
  const text = await res.text();
  return parseCsv(text);
}

// Minimal RFC-4180-ish CSV parser (handles quoted fields with embedded commas/quotes).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...rest] = rows.filter((r) => r.length > 1);
  return rest.map((r) => {
    const obj = {};
    header.forEach((h, idx) => {
      obj[h.trim()] = (r[idx] ?? "").trim();
    });
    return obj;
  });
}

// CelesTrak SATCAT code tables. Unknown codes fall through unchanged so the
// agent still sees something meaningful rather than a blank.
const LAUNCH_SITES = {
  AFETR: "Cape Canaveral, USA", AFWTR: "Vandenberg SFB, USA", KSCUT: "Uchinoura, Japan",
  TYMSC: "Baikonur Cosmodrome, Kazakhstan", PLMSC: "Plesetsk Cosmodrome, Russia",
  FRGUI: "Guiana Space Centre, Kourou", TANSC: "Tanegashima, Japan", JSC: "Jiuquan, China",
  TSC: "Taiyuan, China", XSC: "Xichang, China", WSC: "Wenchang, China",
  SRILR: "Satish Dhawan (Sriharikota), India", WLPIS: "Wallops Island, USA",
  KODAK: "Kodiak, Alaska, USA", SEAL: "Sea Launch (Pacific)", SEALS: "Sea Launch (Pacific)",
  SNMLP: "San Marco Platform, Kenya", SVOBO: "Svobodny, Russia", YAVNE: "Palmachim, Israel",
  DLS: "Dombarovsky, Russia", KYMSC: "Kapustin Yar, Russia", HGSTR: "Hammaguir, Algeria",
  WOMRA: "Woomera, Australia", SEMLS: "Semnan, Iran", SUBL: "Submarine launch",
  ERAS: "Eastern Range (air drop)", WRAS: "Western Range (air drop)", VOSTO: "Vostochny, Russia",
  MAHIA: "Mahia Peninsula, New Zealand", NSC: "Naro, South Korea", KWAJ: "Kwajalein Atoll",
  RLLB: "Rocket Lab LC-1, New Zealand", BOWMN: "Boardman, Oregon, USA",
};
const OPS_STATUS = {
  "+": "operational", "-": "nonoperational", P: "partially operational",
  B: "backup/standby", S: "spare", X: "extended mission", D: "decayed", "?": "unknown",
};
/** RCS in m² -> CelesTrak's size bucket. */
function rcsSize(rcs) {
  if (!Number.isFinite(rcs) || rcs <= 0) return "";
  if (rcs < 0.1) return "small";
  if (rcs <= 1.0) return "medium";
  return "large";
}

/**
 * One bulk SPARQL query for every Wikidata item carrying a COSPAR ID (P247),
 * with its launch vehicle (P375) and operator (P137). Joining on the
 * international designator is an exact match, unlike fuzzy name search — so we
 * either get the right spacecraft or nothing. Best-effort: if Wikidata is
 * unavailable the build continues without this enrichment.
 */
const WIKIDATA_PAGE = 2000;

async function fetchWikidataPage(offset) {
  // Paginated: a single ~1.6MB response gets truncated on some networks, which
  // surfaces as a JSON parse error. Smaller pages are far more reliable, and a
  // failed page costs only that page.
  const sparql = `SELECT ?cospar ?vehicleLabel ?operatorLabel WHERE {
  ?item wdt:P247 ?cospar .
  OPTIONAL { ?item wdt:P375 ?vehicle. }
  OPTIONAL { ?item wdt:P137 ?operator. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
} ORDER BY ?cospar LIMIT ${WIKIDATA_PAGE} OFFSET ${offset}`;
  const res = await fetchWithRetry("https://query.wikidata.org/sparql", {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "query=" + encodeURIComponent(sparql),
  }, { retries: 2, timeoutMs: 90_000 });
  // Parse from text so a truncated body throws here and is retried by the caller
  // rather than silently yielding an empty result set.
  return JSON.parse(await res.text());
}

async function fetchWikidata() {
  const byCospar = new Map();
  for (let offset = 0; offset < 40_000; offset += WIKIDATA_PAGE) {
    let json;
    try {
      json = await fetchWikidataPage(offset);
    } catch (err) {
      console.warn(`[wikidata] page at offset ${offset} failed: ${err.message}`);
      break; // keep whatever we already have
    }
    const rows = json.results?.bindings || [];
    for (const b of rows) {
      const id = b.cospar?.value?.trim();
      if (!id) continue;
      byCospar.set(id, {
        launchVehicle: b.vehicleLabel?.value || "",
        operator: b.operatorLabel?.value || "",
      });
    }
    if (rows.length < WIKIDATA_PAGE) break; // last page
  }
  return byCospar;
}

/**
 * Offline fallback: the committed seed already carries this enrichment, so if
 * Wikidata is unreachable at build time we reuse it rather than shipping a
 * dataset that has silently lost launch vehicles and operators.
 */
async function enrichmentFromSeed() {
  const byCospar = new Map();
  try {
    const gz = await fs.readFile(path.join(OUT_DIR, "satellites.seed.json.gz"));
    const { gunzipSync } = await import("node:zlib");
    const seed = JSON.parse(gunzipSync(gz).toString("utf8"));
    for (const s of seed.satellites || []) {
      if (!s.intlDes || (!s.launchVehicle && !s.operator)) continue;
      byCospar.set(s.intlDes, { launchVehicle: s.launchVehicle || "", operator: s.operator || "" });
    }
  } catch {
    /* no seed available — carry on unenriched */
  }
  return byCospar;
}

// Derive orbit class from TLE mean motion (revs/day) and eccentricity.
// Heuristic: LEO < 2000 km alt, MEO 2000–35586, GEO ~35786 ± with low ecc, HEO for highly elliptical.
function deriveOrbit(meanMotion, eccentricity, inclination) {
  if (!Number.isFinite(meanMotion) || meanMotion <= 0) return { orbitClass: "UNK", periodMin: null, apogeeKm: null, perigeeKm: null };
  const periodMin = 1440 / meanMotion; // minutes
  const mu = 398600.4418; // km^3/s^2
  const n = (meanMotion * 2 * Math.PI) / 86400; // rad/s
  const a = Math.cbrt(mu / (n * n)); // km, semi-major axis
  const e = Math.max(0, Math.min(0.999, eccentricity));
  const apogee = a * (1 + e) - 6378.137;
  const perigee = a * (1 - e) - 6378.137;
  let orbitClass;
  if (e > 0.25) orbitClass = "HEO";
  else if (apogee < 2000) orbitClass = "LEO";
  else if (apogee > 35000 && apogee < 36500 && Math.abs(inclination) < 10 && e < 0.01) orbitClass = "GEO";
  else if (apogee <= 36500) orbitClass = "MEO";
  else orbitClass = "HEO";
  return { orbitClass, periodMin, apogeeKm: Math.round(apogee), perigeeKm: Math.round(perigee) };
}

// Build TLE lines from OMM/JSON format returned by CelesTrak.
// CelesTrak also exposes ?FORMAT=TLE directly, but we already need the JSON for categories,
// so we reconstruct the TLEs via ?FORMAT=TLE for just the `active` group to avoid heavy re-encoding.
async function fetchActiveTleText() {
  const res = await fetchWithRetry(`${CELESTRAK_BASE}?GROUP=active&FORMAT=TLE`);
  return await res.text();
}

function parseTleText(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  const out = new Map();
  for (let i = 0; i < lines.length - 2; i += 3) {
    const name = lines[i].trim();
    const l1 = lines[i + 1];
    const l2 = lines[i + 2];
    if (!l1?.startsWith("1 ") || !l2?.startsWith("2 ")) continue;
    const norad = Number(l1.slice(2, 7).trim());
    if (!Number.isFinite(norad)) continue;
    out.set(norad, { name, tleLine1: l1, tleLine2: l2 });
  }
  return out;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  console.log(`[build-dataset] Fetching CelesTrak active TLEs...`);
  const tleText = await fetchActiveTleText();
  await fs.writeFile(path.join(OUT_DIR, "tle.txt"), tleText);
  const tleByNorad = parseTleText(tleText);
  console.log(`[build-dataset]   ${tleByNorad.size} TLE triplets parsed.`);

  console.log(`[build-dataset] Fetching CelesTrak category groups (${CATEGORY_GROUPS.length})...`);
  const categoriesByNorad = new Map(); // norad -> Set<string>
  for (const group of CATEGORY_GROUPS) {
    try {
      const rows = await fetchGroupJson(group);
      for (const row of rows) {
        const norad = Number(row.NORAD_CAT_ID ?? row.NORAD_ID);
        if (!Number.isFinite(norad)) continue;
        if (!categoriesByNorad.has(norad)) categoriesByNorad.set(norad, new Set());
        categoriesByNorad.get(norad).add(group);
      }
      console.log(`[build-dataset]   ${group}: ${rows.length} entries`);
    } catch (err) {
      console.warn(`[build-dataset]   ${group} failed: ${err.message}`);
    }
  }

  console.log(`[build-dataset] Fetching CelesTrak SATCAT...`);
  let satcat = [];
  try {
    satcat = await fetchSatcat();
    console.log(`[build-dataset]   SATCAT: ${satcat.length} rows`);
  } catch (err) {
    console.warn(`[build-dataset]   SATCAT fetch failed: ${err.message}`);
  }
  const satcatByNorad = new Map();
  for (const row of satcat) {
    const norad = Number(row.NORAD_CAT_ID ?? row["NORAD_CAT_ID"]);
    if (!Number.isFinite(norad)) continue;
    satcatByNorad.set(norad, {
      objectType: row.OBJECT_TYPE || row["OBJECT_TYPE"] || "UNK",
      intlDes: row.OBJECT_ID || row.INTLDES || "",
      opsStatus: row.OPS_STATUS_CODE || "",
      country: row.OWNER || row.COUNTRY || "",
      launchDate: row.LAUNCH_DATE || "",
      launchSite: row.LAUNCH_SITE || "",
      rcs: Number(row.RCS) || null,
      orbitType: row.ORBIT_TYPE || "",
      decayDate: row.DECAY_DATE || "",
      periodMin: Number(row.PERIOD) || null,
      inclination: Number(row.INCLINATION) || null,
      apogeeKm: Number(row.APOGEE) || null,
      perigeeKm: Number(row.PERIGEE) || null,
    });
  }

  console.log("[build-dataset] Fetching Wikidata spacecraft metadata...");
  let wikidataByCospar = await fetchWikidata();
  console.log(`[build-dataset]   Wikidata rows by COSPAR id: ${wikidataByCospar.size}`);
  if (wikidataByCospar.size === 0) {
    wikidataByCospar = await enrichmentFromSeed();
    console.log(`[build-dataset]   Wikidata unavailable — reused seed enrichment: ${wikidataByCospar.size} rows`);
  }

  // Build the merged list — one record per NORAD id that has TLE data (i.e. propagatable).
  const satellites = [];
  let wdMatched = 0;
  for (const [norad, tle] of tleByNorad) {
    const cats = categoriesByNorad.get(norad);
    const sc = satcatByNorad.get(norad);
    const wd = sc?.intlDes ? wikidataByCospar.get(sc.intlDes) : undefined;
    if (wd) wdMatched += 1;
    // Parse TLE line 2 for mean motion, eccentricity, inclination to derive orbit class.
    const l2 = tle.tleLine2;
    const inclination = Number(l2.slice(8, 16).trim());
    const ecc = Number("0." + l2.slice(26, 33).trim());
    const meanMotion = Number(l2.slice(52, 63).trim());
    const { orbitClass, periodMin, apogeeKm, perigeeKm } = deriveOrbit(meanMotion, ecc, inclination);

    satellites.push({
      noradId: norad,
      name: tle.name,
      intlDes: sc?.intlDes || "",
      objectType: sc?.objectType || "PAY", // assume payload if unknown (active catalog bias)
      country: sc?.country || "",
      tleLine1: tle.tleLine1,
      tleLine2: tle.tleLine2,
      categories: cats ? [...cats].sort() : [],
      orbitClass,
      periodMin: sc?.periodMin || (periodMin ? Number(periodMin.toFixed(2)) : null),
      inclinationDeg: sc?.inclination ?? (Number.isFinite(inclination) ? inclination : null),
      apogeeKm: sc?.apogeeKm ?? apogeeKm,
      perigeeKm: sc?.perigeeKm ?? perigeeKm,
      launchDate: sc?.launchDate || "",
      // Extra grounding for the assistant. All optional — omitted when unknown
      // so the JSON stays small across ~16k records.
      ...(sc?.launchSite ? { launchSite: LAUNCH_SITES[sc.launchSite] || sc.launchSite } : {}),
      ...(sc?.opsStatus && OPS_STATUS[sc.opsStatus] ? { opsStatus: OPS_STATUS[sc.opsStatus] } : {}),
      ...(rcsSize(sc?.rcs) ? { sizeClass: rcsSize(sc.rcs), rcsM2: sc.rcs } : {}),
      ...(sc?.decayDate ? { decayDate: sc.decayDate } : {}),
      ...(wd?.launchVehicle ? { launchVehicle: wd.launchVehicle } : {}),
      ...(wd?.operator ? { operator: wd.operator } : {}),
    });
  }
  console.log(`[build-dataset]   Wikidata matched ${wdMatched} of ${satellites.length} objects`);

  const generatedAt = new Date().toISOString();
  const payload = {
    generatedAt,
    count: satellites.length,
    categoryGroups: CATEGORY_GROUPS,
    satellites,
  };

  // Sanity-check before overwriting a known-good dataset: a partially-failed
  // upstream fetch (or a poisoned source) should abort the build rather than
  // silently ship a truncated catalog. The real catalog is ~16k objects.
  const MIN_EXPECTED = 5_000;
  const MAX_EXPECTED = 60_000;
  if (satellites.length < MIN_EXPECTED || satellites.length > MAX_EXPECTED) {
    throw new Error(
      `refusing to write implausible dataset: ${satellites.length} satellites ` +
        `(expected ${MIN_EXPECTED}–${MAX_EXPECTED}). Upstream sources may be degraded.`,
    );
  }
  const withTle = satellites.filter((s) => s.tleLine1 && s.tleLine2).length;
  if (withTle < satellites.length * 0.5) {
    throw new Error(`refusing to write dataset: only ${withTle}/${satellites.length} records have TLEs`);
  }

  await fs.writeFile(path.join(OUT_DIR, "satellites.json"), JSON.stringify(payload));
  await fs.writeFile(
    path.join(OUT_DIR, "build-info.json"),
    JSON.stringify(
      {
        generatedAt,
        satelliteCount: satellites.length,
        satcatCount: satcatByNorad.size,
      },
      null,
      2,
    ),
  );

  const iss = satellites.find((s) => s.noradId === 25544);
  console.log(
    `[build-dataset] Wrote ${satellites.length} satellites. ISS entry: ${
      iss ? `name="${iss.name}" categories=[${iss.categories.join(",")}]` : "NOT FOUND"
    }`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
