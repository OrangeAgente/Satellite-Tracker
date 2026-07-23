import { useMemo, useState } from "react";
import type { Satellite } from "../types";
import { inferUsage } from "../data/usage";
import { groundTrackPoints, subSatellitePoint, type GeoPoint } from "../globe/groundTrack";
import { fmtPeriod, orbitColor } from "./format";

const ACCENT = "#ffb547";

interface Props {
  sat: Satellite;
  expanded: boolean;
  onToggle: () => void;
  onExpand: () => void;
  onClose: () => void;
  pinned: boolean;
  onPin: () => void;
  tracking: boolean;
  onTrack: () => void;
  onAgent: () => void;
  atMs: number;
}

export function InfoSheet({
  sat,
  expanded,
  onToggle,
  onExpand,
  onClose,
  pinned,
  onPin,
  tracking,
  onTrack,
  onAgent,
  atMs,
}: Props) {
  const [showTle, setShowTle] = useState(false);
  const orbCol = orbitColor(sat.orbitClass);

  const stats: [string, string][] = [
    ["INC", sat.inclinationDeg != null ? `${sat.inclinationDeg.toFixed(2)}°` : "—"],
    ["PER", fmtPeriod(sat.periodMin)],
    ["APO", sat.apogeeKm != null ? `${sat.apogeeKm.toLocaleString()} km` : "—"],
    ["PERI", sat.perigeeKm != null ? `${sat.perigeeKm.toLocaleString()} km` : "—"],
    ["MASS", sat.ucs?.launchMassKg ? `${sat.ucs.launchMassKg} kg` : "—"],
    ["LCH", sat.launchDate ? sat.launchDate.slice(0, 4) : "—"],
  ];

  const usage = [...inferUsage(sat)].join(", ");
  const mission: [string, string | undefined][] = [
    ["OPERATOR", sat.ucs?.operator],
    ["COUNTRY", sat.ucs?.operatorCountry || sat.country],
    ["USAGE", usage],
    ["PURPOSE", sat.ucs?.purpose || sat.ucs?.detailedPurpose],
    ["POWER", sat.ucs?.powerW ? `${sat.ucs.powerW} W` : undefined],
    ["LAUNCH", sat.launchDate],
    ["TAGS", sat.categories.slice(0, 3).join(", ") || undefined],
  ];

  const toggleTle = () => {
    setShowTle((v) => !v);
    if (!expanded) onExpand();
  };

  return (
    <section className={"m-sheet" + (expanded ? " expanded" : "")}>
      <button className="m-handle" onClick={onToggle} aria-label={expanded ? "Collapse" : "Expand"}>
        <span className="bar" />
        <span className="chev">{expanded ? "▾" : "▴"}</span>
      </button>
      <div className="m-sheet-head" onClick={onToggle}>
        <span className="m-orbtag" style={{ borderColor: orbCol, color: orbCol }}>{sat.orbitClass}</span>
        <div className="m-sheet-title">
          <div className="name">{sat.name}</div>
          <div className="sub">#{sat.noradId} · {sat.intlDes || "—"} · {sat.objectType}</div>
        </div>
        <button className="m-sheet-x" onClick={(e) => { e.stopPropagation(); onClose(); }}>×</button>
      </div>

      <div className="m-statgrid">
        {stats.map(([k, v]) => (
          <div key={k} className="m-cell"><div className="ck">{k}</div><div className="cv">{v}</div></div>
        ))}
      </div>

      <div className="m-sheet-scroll">
        <div className="m-actions">
          <button className={pinned ? "on" : ""} onClick={onPin}>{pinned ? "PINNED" : "PIN"}</button>
          <button className={tracking ? "on" : ""} onClick={onTrack}>TRACK</button>
          <button className={expanded ? "on" : ""} onClick={onToggle}>INFO</button>
          <button className={showTle ? "on" : ""} onClick={toggleTle}>TLE</button>
        </div>

        {showTle && (
          <div className="m-tle">
            <pre>{sat.tleLine1}{"\n"}{sat.tleLine2}</pre>
          </div>
        )}

        <div className="m-gt">
          <div className="m-gt-h">
            <span className="lbl">Ground track</span>
            <span className="leg"><b>◍</b> position now · ~1 orbit</span>
          </div>
          <MiniGroundTrack sat={sat} atMs={atMs} />
        </div>

        <div className="m-sec-h">Mission</div>
        {mission.map(([k, v]) => (v ? (
          <div key={k} className="m-kv"><span className="kk">{k}</span><span className="kvv">{v}</span></div>
        ) : null))}

        <button className="m-agent-cta" onClick={onAgent}>▮ QUERY THIS SATELLITE →</button>
      </div>
    </section>
  );
}

function MiniGroundTrack({ sat, atMs, width = 330 }: { sat: Satellite; atMs: number; width?: number }) {
  const height = width / 2;
  // Recompute at most once per minute of sim time.
  const bucket = Math.floor(atMs / 60_000);
  const pts = useMemo(() => groundTrackPoints(sat, atMs), [sat.noradId, bucket]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = useMemo(() => subSatellitePoint(sat, atMs), [sat.noradId, bucket]); // eslint-disable-line react-hooks/exhaustive-deps

  const proj = (p: GeoPoint) => ({ x: ((p.lon + 180) / 360) * width, y: ((90 - p.lat) / 180) * height });

  // Split the track wherever longitude wraps across the antimeridian.
  const segments: GeoPoint[][] = [[]];
  for (let i = 0; i < pts.length; i++) {
    if (i > 0 && Math.abs(pts[i].lon - pts[i - 1].lon) > 180) segments.push([]);
    segments[segments.length - 1].push(pts[i]);
  }

  const curXY = cur ? proj(cur) : null;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <rect x="0" y="0" width={width} height={height} fill="rgba(10,14,22,0.6)" stroke="rgba(255,255,255,0.06)" />
      <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="rgba(255,255,255,0.1)" strokeDasharray="2 3" />
      <line x1={width / 2} y1="0" x2={width / 2} y2={height} stroke="rgba(255,255,255,0.06)" />
      {[[30, 45, 60, -95], [10, 50, -15, -60], [15, 60, 15, 25], [25, 70, 35, 95], [10, 20, -30, 135]].map(
        ([h, w, lat, lon], i) => {
          const x = ((lon + 180) / 360) * width;
          const y = ((90 - lat) / 180) * height;
          return <ellipse key={i} cx={x} cy={y} rx={w * 0.4} ry={h * 0.4} fill="rgba(255,255,255,0.05)" />;
        },
      )}
      {segments.map((seg, i) => (
        <polyline
          key={i}
          fill="none"
          stroke={ACCENT}
          strokeWidth="1.2"
          opacity="0.7"
          points={seg.map((p) => { const xy = proj(p); return `${xy.x},${xy.y}`; }).join(" ")}
        />
      ))}
      {curXY && <circle cx={curXY.x} cy={curXY.y} r="3" fill={ACCENT} />}
      {curXY && <circle cx={curXY.x} cy={curXY.y} r="6" fill="none" stroke={ACCENT} strokeWidth="1" opacity="0.5" />}
    </svg>
  );
}
