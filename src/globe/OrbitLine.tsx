import { useEffect, useMemo } from "react";
import * as THREE from "three";
import * as satellite from "satellite.js";
import type { Satellite } from "../types";

const EARTH_RADIUS_KM = 6378.137;

export function OrbitLine({ sat }: { sat: Satellite }) {
  const line = useMemo(() => {
    let rec: satellite.SatRec;
    try {
      rec = satellite.twoline2satrec(sat.tleLine1, sat.tleLine2);
    } catch {
      return null;
    }
    if (rec.error) return null;

    // Mean motion lives in columns 52-63 of line 2; a malformed TLE gives NaN
    // (or a nonsense period) there, which would poison every sample below.
    const periodMin = sat.periodMin ?? 1440 / Number(sat.tleLine2.slice(52, 63));
    if (!Number.isFinite(periodMin) || periodMin <= 0) return null;

    const samples = 256;
    const pts: number[] = [];
    const start = Date.now();
    for (let i = 0; i <= samples; i++) {
      const t = new Date(start + (i / samples) * periodMin * 60_000);
      const pv = satellite.propagate(rec, t);
      const pos = pv.position as satellite.EciVec3<satellite.Kilometer> | false;
      if (!pos) continue;
      const gmst = satellite.gstime(t);
      const geo = satellite.eciToGeodetic(pos, gmst);
      const r = 1 + geo.height / EARTH_RADIUS_KM;
      const cosLat = Math.cos(geo.latitude);
      const x = r * cosLat * Math.cos(geo.longitude);
      const y = r * Math.sin(geo.latitude);
      const z = -r * cosLat * Math.sin(geo.longitude);
      // A TLE can parse without error but still propagate to NaN — drop those
      // samples rather than handing NaN vertices to the geometry.
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      pts.push(x, y, z);
    }
    if (pts.length === 0) return null;

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const m = new THREE.LineBasicMaterial({
      color: 0xffb547,
      transparent: true,
      opacity: 0.75,
    });
    return new THREE.Line(g, m);
  }, [sat]);

  // r3f never disposes objects handed to <primitive>, so release the GPU
  // resources ourselves when the line is replaced or unmounted.
  useEffect(() => {
    if (!line) return;
    return () => {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    };
  }, [line]);

  if (!line) return null;
  return <primitive object={line} />;
}
