#!/usr/bin/env node
/**
 * Build the static satellite dataset by fetching, merging, and writing:
 *   - CelesTrak GP (TLE/OMM) data for the active catalog and per-category groups
 *   - CelesTrak SATCAT (satellite catalog) for universal coverage incl. debris
 *   - UCS Satellite Database for human metadata (users, purpose, operator, mass...)
 *
 * Output:
 *   public/data/satellites.json  — merged records keyed by NORAD id
 *   public/data/tle.txt          — fresh TLE lines for all active objects
 *   public/data/build-info.json  — counts + timestamp
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "data");

const CELESTRAK_BASE = "https://celestrak.org/NORAD/elements/gp.php";
const SATCAT_URL = "https://celestrak.org/pub/satcat.csv";
const UCS_URL = process.env.UCS_URL || "https://www.ucsusa.org/sites/default/files/2023-05/UCS-Satellite-Database%205-1-2023.xlsx";
const UCS_FALLBACK_URL = "https://raw.githubusercontent.com/duffau/UCS-Satellite-Database/main/UCS-Satellite-Database%205-1-2023.xlsx";

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
  } catch (err) {
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

async function fetchUcs() {
  for (const url of [UCS_URL, UCS_FALLBACK_URL]) {
    try {
      const res = await fetchWithRetry(url);
      const buf = new Uint8Array(await res.arrayBuffer());
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      console.log(`[ucs] Loaded ${rows.length} rows from ${url}`);
      return rows;
    } catch (err) {
      console.warn(`[ucs] Failed to fetch from ${url}: ${err.message}`);
    }
  }
  console.warn("[ucs] All UCS sources failed; continuing without UCS metadata.");
  return [];
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

function normalizeUcsRow(row) {
  const pick = (...keys) => {
    for (const k of keys) {
      for (const actual of Object.keys(row)) {
        if (actual.toLowerCase().replace(/[^a-z0-9]+/g, "") === k.toLowerCase().replace(/[^a-z0-9]+/g, "")) {
          const v = row[actual];
          if (v !== "" && v != null) return String(v).trim();
        }
      }
    }
    return undefined;
  };
  const noradRaw = pick("NORAD Number", "norad number", "noradid", "noradnumber");
  const norad = noradRaw ? Number(String(noradRaw).replace(/[^0-9]/g, "")) : NaN;
  if (!Number.isFinite(norad) || norad <= 0) return null;
  return {
    noradId: norad,
    users: pick("Users"),
    purpose: pick("Purpose"),
    detailedPurpose: pick("Detailed Purpose"),
    operatorCountry: pick("Country of Operator/Owner", "Country of Operator"),
    operator: pick("Operator/Owner", "Operator"),
    contractor: pick("Contractor"),
    contractorCountry: pick("Country of Contractor"),
    launchMassKg: pick("Launch Mass (kg.)", "Launch Mass (kg)"),
    dryMassKg: pick("Dry Mass (kg.)", "Dry Mass (kg)"),
    powerW: pick("Power (watts)"),
    launchDate: pick("Date of Launch"),
    expectedLifetimeYears: pick("Expected Lifetime (yrs.)", "Expected Lifetime (yrs)"),
    launchSite: pick("Launch Site"),
    launchVehicle: pick("Launch Vehicle"),
  };
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
  let orbitClass = "UNK";
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
      decayDate: row.DECAY_DATE || "",
      periodMin: Number(row.PERIOD) || null,
      inclination: Number(row.INCLINATION) || null,
      apogeeKm: Number(row.APOGEE) || null,
      perigeeKm: Number(row.PERIGEE) || null,
    });
  }

  console.log(`[build-dataset] Fetching UCS Satellite Database...`);
  const ucsRaw = await fetchUcs();
  const ucsByNorad = new Map();
  for (const row of ucsRaw) {
    const norm = normalizeUcsRow(row);
    if (norm) ucsByNorad.set(norm.noradId, norm);
  }
  console.log(`[build-dataset]   UCS matched NORAD rows: ${ucsByNorad.size}`);

  // Build the merged list — one record per NORAD id that has TLE data (i.e. propagatable).
  const satellites = [];
  for (const [norad, tle] of tleByNorad) {
    const cats = categoriesByNorad.get(norad);
    const sc = satcatByNorad.get(norad);
    const ucs = ucsByNorad.get(norad);

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
      launchDate: ucs?.launchDate || sc?.launchDate || "",
      ucs: ucs
        ? {
            users: ucs.users,
            purpose: ucs.purpose,
            detailedPurpose: ucs.detailedPurpose,
            operatorCountry: ucs.operatorCountry,
            operator: ucs.operator,
            contractor: ucs.contractor,
            contractorCountry: ucs.contractorCountry,
            launchMassKg: ucs.launchMassKg,
            dryMassKg: ucs.dryMassKg,
            powerW: ucs.powerW,
            expectedLifetimeYears: ucs.expectedLifetimeYears,
            launchSite: ucs.launchSite,
            launchVehicle: ucs.launchVehicle,
          }
        : undefined,
    });
  }

  const generatedAt = new Date().toISOString();
  const payload = {
    generatedAt,
    count: satellites.length,
    categoryGroups: CATEGORY_GROUPS,
    satellites,
  };

  await fs.writeFile(path.join(OUT_DIR, "satellites.json"), JSON.stringify(payload));
  await fs.writeFile(
    path.join(OUT_DIR, "build-info.json"),
    JSON.stringify(
      {
        generatedAt,
        satelliteCount: satellites.length,
        ucsMatchCount: ucsByNorad.size,
        satcatCount: satcatByNorad.size,
      },
      null,
      2,
    ),
  );

  const iss = satellites.find((s) => s.noradId === 25544);
  console.log(
    `[build-dataset] Wrote ${satellites.length} satellites. ISS entry: ${
      iss ? `name="${iss.name}" categories=[${iss.categories.join(",")}] ucs=${iss.ucs ? "yes" : "no"}` : "NOT FOUND"
    }`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
