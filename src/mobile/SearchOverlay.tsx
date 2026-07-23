import { useMemo } from "react";
import { useApp } from "../store";
import type { Satellite } from "../types";
import { orbitColor } from "./format";

interface Props {
  satellites: Satellite[];
  onPick: (id: number) => void;
  onClose: () => void;
}

export function SearchOverlay({ satellites, onPick, onClose }: Props) {
  const searchQuery = useApp((s) => s.searchQuery);
  const setSearchQuery = useApp((s) => s.setSearchQuery);

  const results = useMemo(() => {
    const t = searchQuery.trim().toLowerCase();
    if (!t) return satellites.slice(0, 8);
    return satellites
      .filter((s) => `${s.name} ${s.noradId} ${s.intlDes}`.toLowerCase().includes(t))
      .slice(0, 12);
  }, [searchQuery, satellites]);

  return (
    <div className="m-search-ov">
      <div className="m-search-bar">
        <input
          autoFocus
          value={searchQuery}
          placeholder=">> search id or name"
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button className="m-clear" onClick={onClose}>CANCEL</button>
      </div>
      <div className="m-search-results">
        {results.map((s) => (
          <button key={s.noradId} className="m-search-row" onClick={() => onPick(s.noradId)}>
            <span className="dot" style={{ background: orbitColor(s.orbitClass) }} />
            <span className="sr-name">{s.name}</span>
            <span className="sr-meta">#{s.noradId} · {s.orbitClass}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
