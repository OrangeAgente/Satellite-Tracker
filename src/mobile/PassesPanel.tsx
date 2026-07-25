import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../store";
import type { Satellite } from "../types";
import { compassDir, pickPassPool, predictNextPasses, predictPasses } from "../passes/predictor";
import type { Observer } from "../passes/predictor";
import { fmtLocalHMS } from "./format";

/** Idle time before a typed observer edit reaches the store (and re-predicts). */
const COMMIT_DELAY_MS = 400;

export function PassesPanel({ satellites, onClose }: { satellites: Satellite[]; onClose: () => void }) {
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
        <div className="m-head-actions">
          <button className="m-clear" onClick={() => setEditing((e) => !e)}>
            {editing ? "DONE" : `${observer.latDeg.toFixed(2)},${observer.lonDeg.toFixed(2)}`}
          </button>
          <button className="m-panel-x" onClick={onClose} aria-label="Close">×</button>
        </div>
      </div>

      {editing && (
        <ObserverEditor observer={observer} onChange={setObserver} onUseGeo={() => requestGeo(setObserver)} />
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

function ObserverEditor({
  observer,
  onChange,
  onUseGeo,
}: {
  observer: Observer;
  onChange: (o: Observer) => void;
  onUseGeo: () => void;
}) {
  // Every keystroke that reached the store re-ran thousands of SGP4
  // propagations, so the inputs render from local state and only commit after a
  // pause (or on blur / Enter).
  const [draft, setDraft] = useState(observer);
  const draftRef = useRef(observer);
  const committed = useRef(observer);
  const pending = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  // Re-sync when the store changes from outside the editor, e.g. browser geo.
  useEffect(() => {
    if (observer === committed.current) return;
    committed.current = observer;
    draftRef.current = observer;
    setDraft(observer);
  }, [observer]);

  // Flush rather than drop an edit if the editor closes before the timer fires.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (pending.current) onChange(draftRef.current);
    },
    [onChange],
  );

  const commit = () => {
    window.clearTimeout(timer.current);
    pending.current = false;
    committed.current = draftRef.current;
    onChange(draftRef.current);
  };

  const edit = (next: Observer) => {
    draftRef.current = next;
    setDraft(next);
    pending.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(commit, COMMIT_DELAY_MS);
  };

  return (
    <div className="m-obs">
      <ObsRow label="LAT" value={draft.latDeg} onChange={(v) => edit({ ...draftRef.current, latDeg: clamp(v, -90, 90) })} onCommit={commit} />
      <ObsRow label="LON" value={draft.lonDeg} onChange={(v) => edit({ ...draftRef.current, lonDeg: clamp(v, -180, 180) })} onCommit={commit} />
      <ObsRow label="ALT (km)" value={draft.altKm} onChange={(v) => edit({ ...draftRef.current, altKm: Math.max(0, v) })} onCommit={commit} />
      <button className="m-clear" onClick={onUseGeo}>USE BROWSER GEO</button>
      <div className="dim" style={{ fontSize: 9.5, lineHeight: 1.5 }}>
        Used locally for pass prediction, and shared with the AI assistant when you query it.
      </div>
    </div>
  );
}

function ObsRow({
  label,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  onCommit: () => void;
}) {
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
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit();
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
