import { useMemo, useState } from "react";
import type { Satellite } from "../types";
import { inferUsage } from "../data/usage";
import { groundTrackPoints, subSatellitePoint, type GeoPoint } from "../globe/groundTrack";
import { fmtPeriod, orbitColor } from "./format";
import { MERIDIANS, PARALLELS } from "./worldMap";
import { LAND } from "./worldLand";

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
  const grid = "rgba(255,255,255,0.06)";

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }} preserveAspectRatio="xMidYMid meet">
      {/* ocean */}
      <rect x="0" y="0" width={width} height={height} fill="rgba(8,14,24,0.75)" stroke="rgba(255,255,255,0.08)" />
      {/* land (Natural Earth 110m coastlines) */}
      {LAND.map((ring, i) => {
        let d = "";
        for (let j = 0; j < ring.length; j += 2) {
          const x = ((ring[j] + 180) / 360) * width;
          const y = ((90 - ring[j + 1]) / 180) * height;
          d += (j === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
        }
        return (
          <path key={i} d={d + "Z"} fill="rgba(96,132,168,0.16)" stroke="rgba(150,185,215,0.22)" strokeWidth="0.35" strokeLinejoin="round" />
        );
      })}
      {/* lat/lon graticule (equator + prime meridian emphasized) */}
      {PARALLELS.map((lat) => {
        const y = ((90 - lat) / 180) * height;
        return (
          <line key={`p${lat}`} x1="0" y1={y} x2={width} y2={y} stroke={grid}
            strokeWidth={lat === 0 ? 0.8 : 0.5} strokeDasharray={lat === 0 ? "2 3" : undefined}
            opacity={lat === 0 ? 0.9 : 0.55} />
        );
      })}
      {MERIDIANS.map((lon) => {
        const x = ((lon + 180) / 360) * width;
        return (
          <line key={`m${lon}`} x1={x} y1="0" x2={x} y2={height} stroke={grid}
            strokeWidth={lon === 0 ? 0.8 : 0.5} opacity={lon === 0 ? 0.9 : 0.55} />
        );
      })}
      {/* ground track */}
      {segments.map((seg, i) => (
        <polyline
          key={i}
          fill="none"
          stroke={ACCENT}
          strokeWidth="1.4"
          opacity="0.9"
          points={seg.map((p) => { const xy = proj(p); return `${xy.x},${xy.y}`; }).join(" ")}
        />
      ))}
      {curXY && <circle cx={curXY.x} cy={curXY.y} r="3" fill={ACCENT} />}
      {curXY && <circle cx={curXY.x} cy={curXY.y} r="6.5" fill="none" stroke={ACCENT} strokeWidth="1" opacity="0.6" />}
    </svg>
  );
}
