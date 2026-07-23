import * as satellite from "satellite.js";
import type { Satellite } from "../types";

export interface GeoPoint {
  lat: number;
  lon: number;
}

function geodeticAt(rec: satellite.SatRec, date: Date): GeoPoint | null {
  const pv = satellite.propagate(rec, date);
  const pos = pv.position as satellite.EciVec3<satellite.Kilometer> | false;
  if (!pos) return null;
  const gmst = satellite.gstime(date);
  const gd = satellite.eciToGeodetic(pos, gmst);
  return { lat: satellite.degreesLat(gd.latitude), lon: satellite.degreesLong(gd.longitude) };
}

/**
 * Sub-satellite ground track sampled across roughly one orbit, centered on
 * `atMs`. The span is capped at 200 min so a LEO shows a full loop while
 * long-period (MEO/GEO/HEO) orbits stay a bounded, sensible window. Returns
 * geodetic degrees; `[]` if the TLE can't be parsed.
 */
export function groundTrackPoints(sat: Satellite, atMs: number, samples = 120): GeoPoint[] {
  let rec: satellite.SatRec;
  try {
    rec = satellite.twoline2satrec(sat.tleLine1, sat.tleLine2);
  } catch {
    return [];
  }
  if (rec.error) return [];

  const periodMin = sat.periodMin && sat.periodMin > 0 ? Math.min(sat.periodMin, 200) : 92;
  const spanMs = periodMin * 60_000;
  const start = atMs - spanMs / 2;
  const stepMs = spanMs / samples;

  const out: GeoPoint[] = [];
  for (let i = 0; i <= samples; i++) {
    const p = geodeticAt(rec, new Date(start + i * stepMs));
    if (p) out.push(p);
  }
  return out;
}

/** Current sub-satellite point, or null if the TLE can't be parsed. */
export function subSatellitePoint(sat: Satellite, atMs: number): GeoPoint | null {
  let rec: satellite.SatRec;
  try {
    rec = satellite.twoline2satrec(sat.tleLine1, sat.tleLine2);
  } catch {
    return null;
  }
  if (rec.error) return null;
  return geodeticAt(rec, new Date(atMs));
}
