import type { Satellite } from "../types";
import { inferUsage } from "../data/usage";
import { compassDir } from "../passes/predictor";
import type { LiveState } from "./liveState";

export const STATIC_PROMPTS: string[] = [
  "Tell me more about this satellite",
  "What does this satellite do?",
  "Describe the launch",
  "What's its orbital regime?",
  "Who operates it?",
];

export function buildDynamicPrompts(sat: Satellite): string[] {
  const out: string[] = [];
  const cats = sat.categories;
  const name = sat.name;
  if (cats.includes("starlink")) out.push("How does this fit into the Starlink constellation?");
  if (cats.includes("gps-ops")) out.push("What's its role in the GPS constellation?");
  if (cats.includes("galileo")) out.push("Where does it sit in the Galileo constellation?");
  if (cats.includes("weather") || cats.includes("noaa") || cats.includes("goes")) {
    out.push("What weather products does it provide?");
  }
  if (cats.includes("amateur")) out.push("How can I work this satellite with amateur radio?");
  if (cats.includes("stations") || /ISS|TIANGONG|ZARYA/i.test(name)) {
    out.push("Who's currently aboard?");
  }
  if (sat.objectType === "DEB") out.push("What event created this debris?");
  if (sat.objectType === "R/B") out.push("What was the upper stage's mission?");
  if (sat.orbitClass === "GEO") out.push("What's the operational slot longitude?");
  if (sat.orbitClass === "LEO" || sat.orbitClass === "MEO") out.push("When can I see it next?");
  if (cats.includes("military")) out.push("What's publicly known about its mission?");
  return out;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function fmtLat(lat: number): string {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}`;
}
function fmtLon(lon: number): string {
  return `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`;
}
function fmtLocalTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtLocalDateTime(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
// Short label for the browser's local timezone (e.g. "PDT", "GMT+2"), so the
// agent presents times in the same zone the passes panel uses.
function localTzLabel(): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(new Date());
    const name = parts.find((p) => p.type === "timeZoneName")?.value;
    if (name) return name;
  } catch {
    /* fall through to offset */
  }
  const off = -new Date().getTimezoneOffset();
  const s = off >= 0 ? "+" : "-";
  return `UTC${s}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}

function liveStateLines(live: LiveState): string[] {
  const tz = localTzLabel();
  const lines = [
    "",
    `LIVE STATE (computed now from SGP4 — authoritative real-time data; use it for "where is it", "is it overhead", "when can I see it" questions). All times below are in the user's local timezone (${tz}); give the user times in ${tz}, not UTC.`,
    `  time: ${fmtLocalDateTime(new Date(live.atMs))} ${tz}`,
    `  sub-satellite point: ${fmtLat(live.latDeg)}, ${fmtLon(live.lonDeg)}`,
    `  altitude: ${Math.round(live.altKm).toLocaleString()} km`,
    `  ground speed: ${live.speedKmS.toFixed(2)} km/s`,
    `  illumination: ${live.illumination}`,
    `  observer location: ${live.observer.latDeg.toFixed(2)}, ${live.observer.lonDeg.toFixed(2)}`,
  ];
  if (live.look) {
    const el = live.look.elevationDeg;
    lines.push(
      el > 0
        ? `  from observer now: ${el.toFixed(0)}° above the horizon (az ${live.look.azimuthDeg.toFixed(0)}°), range ${Math.round(live.look.rangeKm).toLocaleString()} km`
        : "  from observer now: below the horizon (not currently visible)",
    );
  }
  if (live.passes.length) {
    lines.push(`  upcoming passes over the observer (${tz}, elevation > 5°):`);
    for (const p of live.passes) {
      lines.push(
        `    - ${fmtLocalTime(p.aos)} → ${fmtLocalTime(p.los)}, max el ${Math.round(p.maxElDeg)}°, ${compassDir(p.aosAzDeg)}→${compassDir(p.losAzDeg)}`,
      );
    }
  } else {
    lines.push("  upcoming passes over the observer: none above 5° in the next 24 h");
  }
  return lines;
}

export function buildSystemPrompt(sat: Satellite, live?: LiveState | null): string {
  const ucs = sat.ucs;
  const usage = [...inferUsage(sat)].join(", ");
  const lines: string[] = [
    "You are SATCOM·OPS, an expert in satellites, orbital mechanics, and space situational awareness.",
    "Answer questions about a specific satellite the user is observing. Be precise, concise, and grounded in the facts below.",
    "When uncertain, say so plainly. Distinguish public, well-documented facts from informed inference.",
    "Use SI units and standard orbital terminology. Format short answers tightly; use bullets only when helpful.",
    "",
    "SELECTED SATELLITE",
    `  name: ${sat.name}`,
    `  norad id: ${sat.noradId}`,
    `  intl designator: ${sat.intlDes || "unknown"}`,
    `  object type: ${sat.objectType}`,
    `  country: ${sat.country || "unknown"}`,
    `  orbit class: ${sat.orbitClass}`,
    sat.periodMin != null ? `  period: ${sat.periodMin.toFixed(1)} min` : "  period: unknown",
    sat.inclinationDeg != null ? `  inclination: ${sat.inclinationDeg.toFixed(2)}°` : "  inclination: unknown",
    sat.apogeeKm != null ? `  apogee: ${sat.apogeeKm} km` : "  apogee: unknown",
    sat.perigeeKm != null ? `  perigee: ${sat.perigeeKm} km` : "  perigee: unknown",
    `  launch date: ${sat.launchDate || "unknown"}`,
    `  inferred usage: ${usage}`,
    sat.categories.length > 0 ? `  categories: ${sat.categories.join(", ")}` : "",
  ];
  if (ucs) {
    lines.push("");
    lines.push("UCS METADATA");
    if (ucs.operator) lines.push(`  operator: ${ucs.operator}`);
    if (ucs.operatorCountry) lines.push(`  operator country: ${ucs.operatorCountry}`);
    if (ucs.users) lines.push(`  users: ${ucs.users}`);
    if (ucs.purpose) lines.push(`  purpose: ${ucs.purpose}`);
    if (ucs.detailedPurpose) lines.push(`  detailed purpose: ${ucs.detailedPurpose}`);
    if (ucs.contractor) lines.push(`  contractor: ${ucs.contractor}`);
    if (ucs.launchMassKg) lines.push(`  launch mass: ${ucs.launchMassKg} kg`);
    if (ucs.dryMassKg) lines.push(`  dry mass: ${ucs.dryMassKg} kg`);
    if (ucs.powerW) lines.push(`  power: ${ucs.powerW} W`);
    if (ucs.expectedLifetimeYears) lines.push(`  expected lifetime: ${ucs.expectedLifetimeYears} yr`);
    if (ucs.launchSite) lines.push(`  launch site: ${ucs.launchSite}`);
    if (ucs.launchVehicle) lines.push(`  launch vehicle: ${ucs.launchVehicle}`);
  }
  if (live) lines.push(...liveStateLines(live));
  return lines.filter(Boolean).join("\n");
}
