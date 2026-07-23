import { useMemo, useState } from "react";
import { useApp } from "../store";
import type { Satellite } from "../types";
import { compassDir, pickPassPool, predictNextPasses, predictPasses } from "../passes/predictor";
import type { Observer } from "../passes/predictor";
import { fmtLocalHMS } from "./format";

export function PassesPanel({ satellites }: { satellites: Satellite[] }) {
  const sel = useApp((s) => (s.selectedId != null ? s.getSatellite(s.selectedId) : undefined));
  const observer = useApp((s) => s.observer);
  const setObserver = useApp((s) => s.setObserver);
  const [editing, setEditing] = useState(false);

  const passes = useMemo(() => {
    const from = new Date();
    if (sel) return predictPasses(sel, observer, from, 24, 6);
    return predictNextPasses(pickPassPool(satellites, 12), observer, from, 12, 8);
  }, [sel, satellites, observer]);

  return (
    <section className="m-panel">
      <div className="m-panel-h">
        <span>Upcoming passes</span>
        <button className="m-clear" onClick={() => setEditing((e) => !e)}>
          {editing ? "DONE" : `${observer.latDeg.toFixed(2)},${observer.lonDeg.toFixed(2)}`}
        </button>
      </div>

      {editing && (
        <div className="m-obs">
          <ObsRow label="LAT" value={observer.latDeg} onChange={(v) => setObserver({ ...observer, latDeg: clamp(v, -90, 90) })} />
          <ObsRow label="LON" value={observer.lonDeg} onChange={(v) => setObserver({ ...observer, lonDeg: clamp(v, -180, 180) })} />
          <ObsRow label="ALT (km)" value={observer.altKm} onChange={(v) => setObserver({ ...observer, altKm: Math.max(0, v) })} />
          <button className="m-clear" onClick={() => requestGeo(setObserver)}>USE BROWSER GEO</button>
        </div>
      )}

      <div className="m-panel-note dim">
        {sel ? `Passes for ${sel.name}` : "Brightest LEO fleet · next 12h"} · el &gt; 5°
      </div>

      <div className="m-passes">
        {passes.length === 0 && (
          <div className="m-more">no passes &gt; 5° in next {sel ? 24 : 12}h</div>
        )}
        {passes.map((p, i) => (
          <div key={i} className="m-pass">
            <div className="pn">{p.name}</div>
            <div className="pr">
              <span>AOS {fmtLocalHMS(p.aos)}</span>
              <span className="dim">→ LOS {fmtLocalHMS(p.los)}</span>
            </div>
            <div className="pr">
              <span className={p.maxElDeg > 50 ? "hot" : ""}>el {Math.round(p.maxElDeg)}°</span>
              <span className="dim">{compassDir(p.aosAzDeg)}→{compassDir(p.losAzDeg)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ObsRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="m-obs-row">
      <span>{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        step="0.01"
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
    </label>
  );
}

function requestGeo(setObserver: (o: Observer) => void) {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) =>
      setObserver({
        latDeg: pos.coords.latitude,
        lonDeg: pos.coords.longitude,
        altKm: (pos.coords.altitude ?? 50) / 1000,
      }),
    () => {},
    { timeout: 8000 },
  );
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
