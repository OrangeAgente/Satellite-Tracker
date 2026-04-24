/// <reference lib="webworker" />
import * as satellite from "satellite.js";

// Earth radius in scene units (1 = Earth radius).
const EARTH_RADIUS_KM = 6378.137;

interface InitMessage {
  type: "init";
  tles: { noradId: number; line1: string; line2: string }[];
}

interface TickMessage {
  type: "tick";
  time: number; // ms since epoch
}

interface UpdateMessage {
  type: "update";
  tles: { noradId: number; line1: string; line2: string }[];
}

type InMessage = InitMessage | TickMessage | UpdateMessage;

interface SatEntry {
  noradId: number;
  rec: satellite.SatRec;
  ok: boolean;
}

let entries: SatEntry[] = [];
let idIndex = new Map<number, number>(); // noradId -> entries index

function buildEntries(tles: { noradId: number; line1: string; line2: string }[]): SatEntry[] {
  const out: SatEntry[] = [];
  for (const t of tles) {
    try {
      const rec = satellite.twoline2satrec(t.line1, t.line2);
      out.push({ noradId: t.noradId, rec, ok: !rec.error });
    } catch {
      // keep a bad entry so indices remain stable with the id list
      out.push({ noradId: t.noradId, rec: null as unknown as satellite.SatRec, ok: false });
    }
  }
  return out;
}

function rebuildIndex() {
  idIndex = new Map();
  entries.forEach((e, i) => idIndex.set(e.noradId, i));
}

self.onmessage = (ev: MessageEvent<InMessage>) => {
  const msg = ev.data;
  if (msg.type === "init") {
    entries = buildEntries(msg.tles);
    rebuildIndex();
    const ids = new Int32Array(entries.map((e) => e.noradId));
    (self as unknown as Worker).postMessage({ type: "ready", count: entries.length, ids }, [ids.buffer]);
    return;
  }
  if (msg.type === "update") {
    // Replace satrecs for the given NORAD ids (new TLEs). Preserve order / indices of existing entries.
    for (const t of msg.tles) {
      const idx = idIndex.get(t.noradId);
      if (idx == null) continue;
      try {
        const rec = satellite.twoline2satrec(t.line1, t.line2);
        entries[idx] = { noradId: t.noradId, rec, ok: !rec.error };
      } catch {
        // leave existing entry alone
      }
    }
    (self as unknown as Worker).postMessage({ type: "updated", count: msg.tles.length });
    return;
  }
  if (msg.type === "tick") {
    const date = new Date(msg.time);
    const gmst = satellite.gstime(date);
    const n = entries.length;
    const positions = new Float32Array(n * 3);
    const statuses = new Uint8Array(n); // 1 if ok, 0 if bad
    for (let i = 0; i < n; i++) {
      const e = entries[i];
      if (!e.ok) continue;
      const pv = satellite.propagate(e.rec, date);
      const pos = pv.position as satellite.EciVec3<satellite.Kilometer> | false;
      if (!pos) continue;
      const geo = satellite.eciToGeodetic(pos, gmst);
      const lat = geo.latitude; // rad
      const lon = geo.longitude; // rad
      const altKm = geo.height;
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(altKm)) continue;
      const r = 1 + altKm / EARTH_RADIUS_KM;
      const cosLat = Math.cos(lat);
      // three.js: y-up; convert (lat, lon) with lon east-positive to scene coords.
      positions[i * 3 + 0] = r * cosLat * Math.cos(lon);
      positions[i * 3 + 1] = r * Math.sin(lat);
      positions[i * 3 + 2] = -r * cosLat * Math.sin(lon);
      statuses[i] = 1;
    }
    (self as unknown as Worker).postMessage(
      { type: "positions", time: msg.time, positions, statuses },
      [positions.buffer, statuses.buffer],
    );
    return;
  }
};
