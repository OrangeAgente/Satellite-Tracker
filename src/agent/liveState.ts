import * as satellite from "satellite.js";
import type { Satellite } from "../types";
import { predictPasses, type Observer, type PassEvent } from "../passes/predictor";

export interface LiveState {
  atMs: number;
  latDeg: number;
  lonDeg: number;
  altKm: number;
  speedKmS: number;
  illumination: "sunlit" | "eclipsed";
  observer: Observer;
  look: { elevationDeg: number; azimuthDeg: number; rangeKm: number } | null;
  passes: PassEvent[];
}

const EARTH_R_KM = 6371;
const DEG = Math.PI / 180;

/** Low-precision unit vector to the Sun in ECI — accurate enough for an
 * umbra (sunlit vs. eclipsed) test. */
function sunEciUnit(date: Date): [number, number, number] {
  const jd = date.getTime() / 86_400_000 + 2440587.5;
  const d = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * d) % 360;
  const g = ((357.528 + 0.9856003 * d) % 360) * DEG;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
  const eps = (23.439 - 0.0000004 * d) * DEG;
  return [Math.cos(lambda), Math.cos(eps) * Math.sin(lambda), Math.sin(eps) * Math.sin(lambda)];
}

/**
 * Real-time SGP4 state for a satellite at `atMs`: sub-satellite point,
 * altitude, ground speed, sunlit/eclipsed, the observer's current look angle,
 * and upcoming passes. Returns null if the TLE can't be propagated.
 */
export function computeLiveState(sat: Satellite, observer: Observer, atMs: number): LiveState | null {
  let rec: satellite.SatRec;
  try {
    rec = satellite.twoline2satrec(sat.tleLine1, sat.tleLine2);
  } catch {
    return null;
  }
  if (rec.error) return null;

  const date = new Date(atMs);
  const pv = satellite.propagate(rec, date);
  const pos = pv.position as satellite.EciVec3<satellite.Kilometer> | false;
  const vel = pv.velocity as satellite.EciVec3<satellite.KilometerPerSecond> | false;
  if (!pos) return null;

  const gmst = satellite.gstime(date);
  const gd = satellite.eciToGeodetic(pos, gmst);
  const latDeg = satellite.degreesLat(gd.latitude);
  const lonDeg = satellite.degreesLong(gd.longitude);
  const altKm = gd.height;
  if (!Number.isFinite(latDeg) || !Number.isFinite(lonDeg) || !Number.isFinite(altKm)) return null;

  const speedKmS = vel ? Math.hypot(vel.x, vel.y, vel.z) : 0;

  // Sunlit vs. eclipsed: on the anti-sun side and within Earth's shadow cylinder.
  const sun = sunEciUnit(date);
  const along = pos.x * sun[0] + pos.y * sun[1] + pos.z * sun[2];
  let illumination: "sunlit" | "eclipsed" = "sunlit";
  if (along < 0) {
    const perp = Math.hypot(pos.x - along * sun[0], pos.y - along * sun[1], pos.z - along * sun[2]);
    if (perp < EARTH_R_KM) illumination = "eclipsed";
  }

  // Current look angle from the observer.
  let look: LiveState["look"] = null;
  try {
    const gdObs = { longitude: observer.lonDeg * DEG, latitude: observer.latDeg * DEG, height: observer.altKm };
    const ecf = satellite.eciToEcf(pos, gmst);
    const la = satellite.ecfToLookAngles(gdObs, ecf);
    look = {
      elevationDeg: (la.elevation * 180) / Math.PI,
      azimuthDeg: (la.azimuth * 180) / Math.PI,
      rangeKm: la.rangeSat,
    };
  } catch {
    look = null;
  }

  const passes = predictPasses(sat, observer, date, 24, 4);

  return { atMs, latDeg, lonDeg, altKm, speedKmS, illumination, observer, look, passes };
}
