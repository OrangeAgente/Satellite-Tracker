import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { SearchBar } from "./SearchBar";
import { useApp } from "../store";
import type { Satellite } from "../types";

interface Props {
  satellites: Satellite[];
  total: number;
  visible: number;
}

const MET_EPOCH = Date.UTC(2026, 3, 24, 4, 50, 0);

export function TopBar({ satellites, total, visible }: Props) {
  const lastRefreshAt = useApp((s) => s.lastRefreshAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, []);

  const utc = formatUtc(now);
  const met = formatMet(now - MET_EPOCH);
  const tle = lastRefreshAt ? formatDelta(now - Date.parse(lastRefreshAt)) : "—";

  return (
    <header className="ops-topbar">
      <div className="ops-logo">
        <span className="ops-logo-glyph">▲</span>
        <span>SATCOM·OPS</span>
        <span className="ops-build">v0.4.1 · canary</span>
      </div>
      <div className="ops-time">
        <Telem k="UTC" v={utc} hot />
        <Telem k="MET" v={met} />
        <Telem k="LIVE" v={<span className="dot-live">● ONLINE</span>} />
        <Telem k="TRACKED" v={`${visible.toLocaleString()} / ${total.toLocaleString()}`} />
        <Telem k="TLE" v={tle} />
      </div>
      <div className="ops-search">
        <SearchBar satellites={satellites} />
      </div>
    </header>
  );
}

function Telem({ k, v, hot }: { k: string; v: ReactNode; hot?: boolean }) {
  return (
    <div className={`telem${hot ? " hot" : ""}`}>
      <span className="telem-k">{k}</span>
      <span className="telem-v">{v}</span>
    </div>
  );
}

function pad(n: number, w = 2) {
  return n.toString().padStart(w, "0");
}

function formatUtc(ms: number) {
  const d = new Date(ms);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.` +
    `${pad(d.getUTCMilliseconds(), 3)}`
  );
}

function formatMet(ms: number) {
  const sign = ms < 0 ? "-" : "+";
  const a = Math.abs(ms);
  const h = Math.floor(a / 3_600_000);
  const m = Math.floor((a % 3_600_000) / 60_000);
  const s = Math.floor((a % 60_000) / 1000);
  return `T${sign} ${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatDelta(ms: number) {
  if (ms < 0) ms = 0;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `Δ ${pad(m)}:${pad(s)}`;
}
