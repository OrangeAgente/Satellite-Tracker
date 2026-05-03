import { useMemo, useState } from "react";
import { useApp } from "../store";
import { compassDir, predictNextPasses, predictPasses } from "../passes/predictor";
import type { Satellite } from "../types";

const VISIBLE_FALLBACKS = ["ISS", "HUBBLE", "TIANGONG", "STARLINK", "NOAA"];

export function UpcomingPasses({ satellites }: { satellites: Satellite[] }) {
  const sel = useApp((s) => (s.selectedId != null ? s.getSatellite(s.selectedId) : undefined));
  const observer = useApp((s) => s.observer);
  const setObserver = useApp((s) => s.setObserver);
  const [editing, setEditing] = useState(false);

  const passes = useMemo(() => {
    const from = new Date();
    if (sel) {
      return predictPasses(sel, observer, from, 24, 6);
    }
    const fallbackPool = pickFallbacks(satellites, 12);
    return predictNextPasses(fallbackPool, observer, from, 12, 6);
  }, [sel, satellites, observer]);

  const headerRight = `${observer.latDeg.toFixed(2)},${observer.lonDeg.toFixed(2)}`;

  return (
    <section className="ops-section">
      <div className="ops-section-h">
        <span>Upcoming passes</span>
        <button
          className="ops-filter-clear"
          style={{ letterSpacing: "0.12em" }}
          onClick={() => setEditing((e) => !e)}
        >
          {editing ? "DONE" : headerRight}
        </button>
      </div>

      {editing && (
        <ObserverEditor observer={observer} onChange={setObserver} onUseGeo={() => requestGeo(setObserver)} />
      )}

      <div className="ops-passes">
        {passes.length === 0 && (
          <div className="dim" style={{ fontSize: 10, padding: "6px 0" }}>
            No passes &gt; 5° elevation in next {sel ? 24 : 12}h.
          </div>
        )}
        {passes.map((p, i) => (
          <div key={i} className="ops-pass">
            <div className="ops-pass-name">{p.name}</div>
            <div className="ops-pass-row">
              <span>AOS {hms(p.aos)}</span>
              <span className="dim">→ LOS {hms(p.los)}</span>
            </div>
            <div className="ops-pass-row">
              <span className={p.maxElDeg > 50 ? "ops-hot" : ""}>el {Math.round(p.maxElDeg)}°</span>
              <span className="dim">
                {compassDir(p.aosAzDeg)}→{compassDir(p.losAzDeg)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ObserverEditor({
  observer,
  onChange,
  onUseGeo,
}: {
  observer: { latDeg: number; lonDeg: number; altKm: number };
  onChange: (o: typeof observer) => void;
  onUseGeo: () => void;
}) {
  return (
    <div style={{ display: "grid", gap: 4, padding: "4px 0" }}>
      <NumRow
        k="LAT"
        v={observer.latDeg}
        step={0.01}
        onChange={(v) => onChange({ ...observer, latDeg: clamp(v, -90, 90) })}
      />
      <NumRow
        k="LON"
        v={observer.lonDeg}
        step={0.01}
        onChange={(v) => onChange({ ...observer, lonDeg: clamp(v, -180, 180) })}
      />
      <NumRow
        k="ALT (km)"
        v={observer.altKm}
        step={0.01}
        onChange={(v) => onChange({ ...observer, altKm: Math.max(0, v) })}
      />
      <button className="ops-filter-clear" style={{ alignSelf: "start" }} onClick={onUseGeo}>
        USE BROWSER GEO
      </button>
    </div>
  );
}

function NumRow({ k, v, step, onChange }: { k: string; v: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="kv">
      <span className="kv-k">{k}</span>
      <input
        type="number"
        step={step}
        value={Number.isFinite(v) ? v : 0}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        style={{
          background: "var(--ops-bg-inset)",
          border: "1px solid var(--ops-line)",
          color: "var(--ops-fg)",
          fontFamily: "inherit",
          fontSize: 10,
          padding: "2px 6px",
          width: 90,
          textAlign: "right",
        }}
      />
    </label>
  );
}

function requestGeo(setObserver: (o: { latDeg: number; lonDeg: number; altKm: number }) => void) {
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

function pickFallbacks(satellites: Satellite[], n: number) {
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

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
function hms(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
