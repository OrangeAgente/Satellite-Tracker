import * as satellite from "satellite.js";
import type { Satellite } from "../types";

export interface PassEvent {
  noradId: number;
  name: string;
  aos: Date;
  los: Date;
  maxElDeg: number;
  aosAzDeg: number;
  losAzDeg: number;
}

export interface Observer {
  latDeg: number;
  lonDeg: number;
  altKm: number;
}

export const DEFAULT_OBSERVER: Observer = {
  latDeg: 37.7749,
  lonDeg: -122.4194,
  altKm: 0.05,
};

const STEP_S = 30;
const MIN_EL_DEG = 5;

function observerGd(o: Observer) {
  return {
    latitude: (o.latDeg * Math.PI) / 180,
    longitude: (o.lonDeg * Math.PI) / 180,
    height: o.altKm,
  };
}

function lookAngles(rec: satellite.SatRec, t: Date, gd: ReturnType<typeof observerGd>) {
  const pv = satellite.propagate(rec, t);
  const pos = pv.position as satellite.EciVec3<satellite.Kilometer> | false;
  if (!pos) return null;
  const gmst = satellite.gstime(t);
  const ecf = satellite.eciToEcf(pos, gmst);
  return satellite.ecfToLookAngles(gd, ecf);
}

/** Compute upcoming passes for one satellite over `windowHours` from `from`. */
export function predictPasses(
  sat: Satellite,
  observer: Observer,
  from: Date,
  windowHours = 24,
  maxPasses = 6,
): PassEvent[] {
  let rec: satellite.SatRec;
  try {
    rec = satellite.twoline2satrec(sat.tleLine1, sat.tleLine2);
  } catch {
    return [];
  }
  if (rec.error) return [];

  const gd = observerGd(observer);
  const out: PassEvent[] = [];

  let t = from.getTime();
  const end = t + windowHours * 3_600_000;
  let inPass = false;
  let aosT = 0;
  let aosAz = 0;
  let maxEl = -90;

  while (t <= end && out.length < maxPasses) {
    const date = new Date(t);
    const la = lookAngles(rec, date, gd);
    if (la) {
      const elDeg = (la.elevation * 180) / Math.PI;
      const azDeg = (la.azimuth * 180) / Math.PI;
      if (!inPass && elDeg > 0) {
        inPass = true;
        aosT = t;
        aosAz = azDeg;
        maxEl = elDeg;
      } else if (inPass) {
        if (elDeg > maxEl) maxEl = elDeg;
        if (elDeg <= 0) {
          if (maxEl >= MIN_EL_DEG) {
            out.push({
              noradId: sat.noradId,
              name: sat.name,
              aos: new Date(aosT),
              los: new Date(t),
              maxElDeg: maxEl,
              aosAzDeg: aosAz,
              losAzDeg: azDeg,
            });
          }
          inPass = false;
          maxEl = -90;
        }
      }
    }
    t += STEP_S * 1000;
  }
  return out;
}

/** Predict passes for many sats and merge into a chronological list. */
export function predictNextPasses(
  sats: Satellite[],
  observer: Observer,
  from: Date,
  windowHours = 12,
  total = 8,
): PassEvent[] {
  const all: PassEvent[] = [];
  for (const s of sats) {
    const passes = predictPasses(s, observer, from, windowHours, 3);
    for (const p of passes) all.push(p);
  }
  all.sort((a, b) => a.aos.getTime() - b.aos.getTime());
  return all.slice(0, total);
}

export function compassDir(azDeg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(((azDeg % 360) + 360) % 360 / 45) % 8];
}

const VISIBLE_FALLBACKS = ["ISS", "HUBBLE", "TIANGONG", "STARLINK", "NOAA"];

/** A small pool of bright/known LEO payloads to show fleet passes for when no
 * satellite is selected. Shared by the desktop and mobile passes panels. */
export function pickPassPool(satellites: Satellite[], n: number): Satellite[] {
  const out: Satellite[] = [];
  const seen = new Set<number>();
  for (const needle of VISIBLE_FALLBACKS) {
    for (const s of satellites) {
      if (seen.has(s.noradId)) continue;
      if (s.name.toUpperCase().includes(needle)) {
        out.push(s);
        seen.add(s.noradId);
        if (out.length >= n) return out;
        break;
      }
    }
  }
  for (const s of satellites) {
    if (out.length >= n) break;
    if (seen.has(s.noradId)) continue;
    if (s.orbitClass === "LEO" && s.objectType === "PAY") {
      out.push(s);
      seen.add(s.noradId);
    }
  }
  return out;
}
