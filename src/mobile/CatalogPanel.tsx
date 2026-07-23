import { useMemo } from "react";
import { useApp } from "../store";
import type { OrbitClass, Satellite } from "../types";
import { orbitColor } from "./format";

const ORBIT_LIST: OrbitClass[] = ["LEO", "MEO", "GEO", "HEO"];
const USAGE_LIST = ["Civil", "Commercial", "Government", "Military"];
const TYPE_LIST = ["PAY", "R/B", "DEB"];
const VISIBLE_LIMIT = 120;

interface Props {
  satellites: Satellite[];
  visibleIds: Set<number>;
  onPick: (id: number) => void;
  onClose: () => void;
}

export function CatalogPanel({ satellites, visibleIds, onPick, onClose }: Props) {
  const selectedId = useApp((s) => s.selectedId);
  const pinnedIds = useApp((s) => s.pinnedIds);
  const filters = useApp((s) => s.filters);
  const toggleFilter = useApp((s) => s.toggleFilter);
  const clearAllFilters = useApp((s) => s.clearAllFilters);

  const activeCount = filters.orbitClasses.size + filters.users.size + filters.objectTypes.size;

  const rows = useMemo(() => {
    const out: Satellite[] = [];
    for (const s of satellites) {
      if (visibleIds.has(s.noradId)) {
        out.push(s);
        if (out.length >= VISIBLE_LIMIT) break;
      }
    }
    return out;
  }, [satellites, visibleIds]);

  return (
    <section className="m-panel">
      <div className="m-panel-h">
        <span>Catalog</span>
        <div className="m-head-actions">
          <span className="right">{visibleIds.size.toLocaleString()} / {satellites.length.toLocaleString()}</span>
          <button className="m-panel-x" onClick={onClose} aria-label="Close">×</button>
        </div>
      </div>

      <div className="m-filterbar">
        <div className="m-filter-row">
          <span className="fl">ORBIT</span>
          <div className="pills">
            {ORBIT_LIST.map((o) => (
              <Pill key={o} label={o} swatch={orbitColor(o)} on={filters.orbitClasses.has(o)} onClick={() => toggleFilter("orbitClasses", o)} />
            ))}
          </div>
        </div>
        <div className="m-filter-row">
          <span className="fl">USAGE</span>
          <div className="pills">
            {USAGE_LIST.map((u) => (
              <Pill key={u} label={u} on={filters.users.has(u)} onClick={() => toggleFilter("users", u)} />
            ))}
          </div>
        </div>
        <div className="m-filter-row">
          <span className="fl">TYPE</span>
          <div className="pills">
            {TYPE_LIST.map((t) => (
              <Pill key={t} label={t} on={filters.objectTypes.has(t)} onClick={() => toggleFilter("objectTypes", t)} />
            ))}
            {activeCount > 0 && <button className="m-clear" onClick={clearAllFilters}>CLEAR · {activeCount}</button>}
          </div>
        </div>
      </div>

      <div className="m-list">
        {rows.map((s) => (
          <button
            key={s.noradId}
            className={"m-list-row" + (s.noradId === selectedId ? " sel" : "") + (pinnedIds.includes(s.noradId) ? " pinned" : "")}
            onClick={() => onPick(s.noradId)}
          >
            <span className="lid">{s.noradId}</span>
            <span className="lname">{s.name}</span>
            <span className="lorb" style={{ color: orbitColor(s.orbitClass) }}>{s.orbitClass}</span>
          </button>
        ))}
        {visibleIds.size > rows.length && (
          <div className="m-more">+ {(visibleIds.size - rows.length).toLocaleString()} more</div>
        )}
        {visibleIds.size === 0 && <div className="m-more">no objects match filters</div>}
      </div>
    </section>
  );
}

function Pill({ label, swatch, on, onClick }: { label: string; swatch?: string; on: boolean; onClick: () => void }) {
  return (
    <button className={"m-pill" + (on ? " on" : "")} onClick={onClick}>
      {swatch && <i style={{ background: swatch }} />}
      {label}
    </button>
  );
}
