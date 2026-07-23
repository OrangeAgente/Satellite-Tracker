import { useApp } from "../store";
import { orbitColor } from "./format";

export function CompareTray({ onPick }: { onPick: (id: number) => void }) {
  const pinnedIds = useApp((s) => s.pinnedIds);
  const selectedId = useApp((s) => s.selectedId);
  const getSatellite = useApp((s) => s.getSatellite);
  const togglePin = useApp((s) => s.togglePin);

  return (
    <div className="m-tray">
      <span className="m-tray-lbl">PINS</span>
      {pinnedIds.map((id) => {
        const s = getSatellite(id);
        if (!s) return null;
        return (
          <button
            key={id}
            className={"m-tray-card" + (id === selectedId ? " sel" : "")}
            onClick={() => onPick(id)}
          >
            <span className="m-tray-name">{s.name}</span>
            <span className="m-tray-orb" style={{ color: orbitColor(s.orbitClass) }}>
              {s.orbitClass} · {s.inclinationDeg != null ? `${s.inclinationDeg.toFixed(0)}°` : "—"}
            </span>
            <span className="m-tray-x" onClick={(e) => { e.stopPropagation(); togglePin(id); }}>×</span>
          </button>
        );
      })}
    </div>
  );
}
