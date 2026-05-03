import { useMemo } from "react";
import { useApp } from "../store";
import type { Satellite } from "../types";

const ORBIT_COLOR: Record<string, string> = {
  LEO: "var(--orb-leo)",
  MEO: "var(--orb-meo)",
  GEO: "var(--orb-geo)",
  HEO: "var(--orb-heo)",
  UNK: "var(--orb-unk)",
};

const VISIBLE_LIMIT = 200;

export function Catalog({ satellites, visibleIds }: { satellites: Satellite[]; visibleIds: Set<number> }) {
  const selectedId = useApp((s) => s.selectedId);
  const setSelectedId = useApp((s) => s.setSelectedId);
  const pinnedIds = useApp((s) => s.pinnedIds);

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
    <section className="ops-section">
      <div className="ops-section-h">
        <span>Catalog</span>
        <span className="right">{visibleIds.size.toLocaleString()}</span>
      </div>
      <div className="ops-list">
        {rows.map((s) => (
          <div
            key={s.noradId}
            className={
              "ops-list-row" +
              (s.noradId === selectedId ? " sel" : "") +
              (pinnedIds.includes(s.noradId) ? " pinned" : "")
            }
            onClick={() => setSelectedId(s.noradId)}
          >
            <span className="ops-list-id">{s.noradId}</span>
            <span className="ops-list-name">{s.name}</span>
            <span className="ops-list-orb" style={{ color: ORBIT_COLOR[s.orbitClass] || "var(--orb-unk)" }}>
              {s.orbitClass}
            </span>
          </div>
        ))}
        {visibleIds.size > rows.length && (
          <div className="ops-list-more">+ {(visibleIds.size - rows.length).toLocaleString()} more</div>
        )}
      </div>
    </section>
  );
}
