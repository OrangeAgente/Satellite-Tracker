import { useMemo } from "react";
import * as THREE from "three";
import * as satellite from "satellite.js";
import type { Satellite } from "../types";

const EARTH_RADIUS_KM = 6378.137;

export function OrbitLine({ sat }: { sat: Satellite }) {
  const line = useMemo(() => {
    const rec = satellite.twoline2satrec(sat.tleLine1, sat.tleLine2);
    const periodMin = sat.periodMin ?? 1440 / Number(sat.tleLine2.slice(52, 63));
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
      pts.push(
        r * cosLat * Math.cos(geo.longitude),
        r * Math.sin(geo.latitude),
        -r * cosLat * Math.sin(geo.longitude),
      );
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const m = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.75,
    });
    return new THREE.Line(g, m);
  }, [sat]);

  return <primitive object={line} />;
}
