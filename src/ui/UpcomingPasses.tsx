import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../store";
import { compassDir, pickPassPool, predictNextPasses, predictPasses } from "../passes/predictor";
import type { Satellite } from "../types";

/** Idle time before a typed observer edit reaches the store (and re-predicts). */
const COMMIT_DELAY_MS = 400;

type ObserverValue = { latDeg: number; lonDeg: number; altKm: number };

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
    const fallbackPool = pickPassPool(satellites, 12);
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
  observer: ObserverValue;
  onChange: (o: ObserverValue) => void;
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

  const edit = (next: ObserverValue) => {
    draftRef.current = next;
    setDraft(next);
    pending.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(commit, COMMIT_DELAY_MS);
  };

  return (
    <div style={{ display: "grid", gap: 4, padding: "4px 0" }}>
      <NumRow
        k="LAT"
        v={draft.latDeg}
        step={0.01}
        onChange={(v) => edit({ ...draftRef.current, latDeg: clamp(v, -90, 90) })}
        onCommit={commit}
      />
      <NumRow
        k="LON"
        v={draft.lonDeg}
        step={0.01}
        onChange={(v) => edit({ ...draftRef.current, lonDeg: clamp(v, -180, 180) })}
        onCommit={commit}
      />
      <NumRow
        k="ALT (km)"
        v={draft.altKm}
        step={0.01}
        onChange={(v) => edit({ ...draftRef.current, altKm: Math.max(0, v) })}
        onCommit={commit}
      />
      <button className="ops-filter-clear" style={{ alignSelf: "start" }} onClick={onUseGeo}>
        USE BROWSER GEO
      </button>
      <div className="dim" style={{ fontSize: 9, lineHeight: 1.5 }}>
        Used locally for pass prediction, and shared with the AI assistant when you query it.
      </div>
    </div>
  );
}

function NumRow({
  k,
  v,
  step,
  onChange,
  onCommit,
}: {
  k: string;
  v: number;
  step: number;
  onChange: (v: number) => void;
  onCommit: () => void;
}) {
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
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit();
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

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
function hms(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
