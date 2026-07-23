import type { OrbitClass } from "../types";

// Matches the --orb-* CSS variables in styles.css.
const ORBIT_COLORS: Record<OrbitClass, string> = {
  LEO: "#5cd0ff",
  MEO: "#98f273",
  GEO: "#ffc846",
  HEO: "#ff73d2",
  UNK: "#6b7280",
};

export function orbitColor(orbit: OrbitClass): string {
  return ORBIT_COLORS[orbit] ?? ORBIT_COLORS.UNK;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** UTC timestamp as `YYYY-MM-DD HH:MM:SS`. */
export function fmtUTC(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** Local `HH:MM:SS` — used for pass AOS/LOS times. */
export function fmtLocalHMS(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Orbital period: hours for long orbits, minutes otherwise. `—` when unknown. */
export function fmtPeriod(min: number | null | undefined): string {
  if (min == null) return "—";
  return min > 1000 ? `${(min / 60).toFixed(1)} h` : `${min.toFixed(0)} m`;
}

/** Signed `±HH:MM` offset from now, for the sim clock. */
export function fmtOffset(ms: number): string {
  const sign = ms < 0 ? "-" : "+";
  const a = Math.abs(ms);
  return `${sign}${pad(Math.floor(a / 3_600_000))}:${pad(Math.floor((a % 3_600_000) / 60_000))}`;
}
