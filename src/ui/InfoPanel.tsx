import { useApp } from "../store";
import type { OrbitClass, Satellite } from "../types";
import { inferUsage } from "../data/usage";

function openExternal(url: string) {
  // noopener prevents reverse tabnabbing; noreferrer drops the Referer header.
  window.open(url, "_blank", "noopener,noreferrer");
}

const ORBIT_COLOR: Record<OrbitClass, string> = {
  LEO: "var(--orb-leo)",
  MEO: "var(--orb-meo)",
  GEO: "var(--orb-geo)",
  HEO: "var(--orb-heo)",
  UNK: "var(--orb-unk)",
};

export function InfoPanel() {
  const sel = useApp((s) => (s.selectedId != null ? s.getSatellite(s.selectedId) : undefined));
  const setSelectedId = useApp((s) => s.setSelectedId);
  const pinnedIds = useApp((s) => s.pinnedIds);
  const togglePin = useApp((s) => s.togglePin);
  const trackingId = useApp((s) => s.trackingId);
  const setTrackingId = useApp((s) => s.setTrackingId);

  if (!sel) return null;
  const ucs = sel.ucs;
  const orbColor = ORBIT_COLOR[sel.orbitClass] ?? ORBIT_COLOR.UNK;
  const pinned = pinnedIds.includes(sel.noradId);
  const tracking = trackingId === sel.noradId;

  return (
    <>
      <div className="ops-target-head">
        <div className="ops-target-tag" style={{ borderColor: orbColor, color: orbColor }}>
          {sel.orbitClass}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="ops-target-name">{sel.name}</div>
          <div className="ops-target-sub">
            #{sel.noradId} · {sel.intlDes || "—"} · {sel.objectType}
          </div>
        </div>
        <button className="ops-target-close" onClick={() => setSelectedId(null)} aria-label="Close">
          ×
        </button>
      </div>

      <div className="ops-target-grid">
        <Cell k="INC" v={sel.inclinationDeg != null ? `${sel.inclinationDeg.toFixed(2)}°` : "—"} />
        <Cell k="PER" v={sel.periodMin != null ? `${sel.periodMin.toFixed(1)}m` : "—"} />
        <Cell k="APO" v={sel.apogeeKm != null ? `${sel.apogeeKm.toLocaleString()}km` : "—"} />
        <Cell k="PERI" v={sel.perigeeKm != null ? `${sel.perigeeKm.toLocaleString()}km` : "—"} />
        <Cell k="MASS" v={ucs?.launchMassKg ? `${ucs.launchMassKg}kg` : "—"} />
        <Cell k="LCH" v={(sel.launchDate || "").slice(0, 4) || "—"} />
      </div>

      <OrbitMini sat={sel} />

      <div className="ops-actions">
        <button className={pinned ? "on" : ""} onClick={() => togglePin(sel.noradId)}>
          {pinned ? "PINNED" : "PIN"}
        </button>
        <button
          className={tracking ? "on" : ""}
          onClick={() => setTrackingId(tracking ? null : sel.noradId)}
        >
          TRACK
        </button>
        <button onClick={() => openExternal(`https://www.n2yo.com/satellite/?s=${sel.noradId}`)}>
          INFO
        </button>
        <button onClick={() => openExternal(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${sel.noradId}&FORMAT=tle`)}>
          TLE
        </button>
      </div>

      <section className="ops-section compact">
        <div className="ops-section-h">
          <span>Mission</span>
        </div>
        <Kv k="OPERATOR" v={ucs?.operator} />
        <Kv k="COUNTRY" v={ucs?.operatorCountry || sel.country} />
        <Kv k="USAGE" v={ucs?.users || [...inferUsage(sel)].join(", ")} />
        <Kv k="PURPOSE" v={ucs?.purpose} />
        <Kv k="POWER" v={ucs?.powerW ? `${ucs.powerW} W` : null} />
        <Kv k="VEHICLE" v={ucs?.launchVehicle} />
        <Kv k="LAUNCH" v={sel.launchDate} />
        {sel.categories.length > 0 && <Kv k="TAGS" v={sel.categories.slice(0, 3).join(", ")} />}
      </section>
    </>
  );
}

function Cell({ k, v }: { k: string; v: string }) {
  return (
    <div className="cell">
      <div className="cell-k">{k}</div>
      <div className="cell-v">{v}</div>
    </div>
  );
}

function Kv({ k, v }: { k: string; v?: string | null }) {
  if (!v) return null;
  return (
    <div className="kv">
      <span className="kv-k">{k}</span>
      <span className="kv-v" title={v}>
        {v}
      </span>
    </div>
  );
}

function OrbitMini({ sat }: { sat: Satellite }) {
  const apo = sat.apogeeKm ?? 600;
  const peri = sat.perigeeKm ?? apo;
  const a = (apo + peri) / 2 + 6378;
  const c = (apo - peri) / 2;
  const e = Math.min(0.9, c / a);
  const rx = 120;
  const ry = rx * Math.sqrt(1 - e * e);
  return (
    <div className="ops-orbit-mini">
      <svg viewBox="0 0 280 100" preserveAspectRatio="xMidYMid meet">
        <defs>
          <pattern id="opsGrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0 H0 V20" fill="none" stroke="var(--ops-line-soft)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="280" height="100" fill="url(#opsGrid)" />
        <circle cx="140" cy="50" r="10" fill="var(--ops-bg-inset)" stroke="var(--ops-line)" />
        <ellipse
          cx="140"
          cy="50"
          rx={rx}
          ry={ry}
          fill="none"
          stroke="var(--ops-hot)"
          strokeWidth="1"
          strokeDasharray="4 3"
          opacity="0.7"
        />
        <circle cx={140 + rx} cy="50" r="3" fill="var(--ops-hot)" />
      </svg>
    </div>
  );
}
