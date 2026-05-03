import { useApp } from "../store";
import type { OrbitClass } from "../types";

const ORBIT_COLOR: Record<OrbitClass, string> = {
  LEO: "var(--orb-leo)",
  MEO: "var(--orb-meo)",
  GEO: "var(--orb-geo)",
  HEO: "var(--orb-heo)",
  UNK: "var(--orb-unk)",
};

export function CompareTray() {
  const pinnedIds = useApp((s) => s.pinnedIds);
  const togglePin = useApp((s) => s.togglePin);
  const selectedId = useApp((s) => s.selectedId);
  const setSelectedId = useApp((s) => s.setSelectedId);
  const getSatellite = useApp((s) => s.getSatellite);

  return (
    <div className="ops-tray">
      <div className="ops-tray-lbl">COMPARE TRAY</div>
      {pinnedIds.length === 0 ? (
        <div className="ops-tray-empty">no pinned objects · pin from right panel</div>
      ) : (
        pinnedIds.map((id) => {
          const s = getSatellite(id);
          if (!s) return null;
          const period =
            s.periodMin == null
              ? "—"
              : s.periodMin > 1000
              ? `${(s.periodMin / 60).toFixed(1)}h`
              : `${s.periodMin.toFixed(0)}m`;
          return (
            <div
              key={id}
              className={"ops-tray-card" + (id === selectedId ? " sel" : "")}
              onClick={() => setSelectedId(id)}
            >
              <div className="ops-tray-name">{s.name}</div>
              <div className="ops-tray-grid">
                <span>ORB</span>
                <span style={{ color: ORBIT_COLOR[s.orbitClass] }}>{s.orbitClass}</span>
                <span>INC</span>
                <span>{s.inclinationDeg != null ? `${s.inclinationDeg.toFixed(1)}°` : "—"}</span>
                <span>PER</span>
                <span>{period}</span>
                <span>APO</span>
                <span>{s.apogeeKm != null ? `${s.apogeeKm.toLocaleString()}km` : "—"}</span>
              </div>
              <button
                className="ops-tray-x"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePin(id);
                }}
                aria-label="Unpin"
              >
                ×
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
