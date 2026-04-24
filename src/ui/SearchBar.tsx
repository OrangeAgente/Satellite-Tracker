import { useMemo, useState } from "react";
import { useApp } from "../store";
import type { Satellite } from "../types";

export function SearchBar({ satellites }: { satellites: Satellite[] }) {
  const searchQuery = useApp((s) => s.searchQuery);
  const setSearchQuery = useApp((s) => s.setSearchQuery);
  const setSelectedId = useApp((s) => s.setSelectedId);
  const [focused, setFocused] = useState(false);

  const suggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const out: Satellite[] = [];
    for (const s of satellites) {
      const hay = `${s.name} ${s.noradId} ${s.intlDes}`.toLowerCase();
      if (hay.includes(q)) out.push(s);
      if (out.length >= 8) break;
    }
    return out;
  }, [searchQuery, satellites]);

  return (
    <div className="search">
      <input
        type="search"
        value={searchQuery}
        placeholder="Search name or NORAD id (e.g. ISS, 25544)…"
        onChange={(e) => setSearchQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 120)}
      />
      {focused && suggestions.length > 0 && (
        <ul className="search-suggest">
          {suggestions.map((s) => (
            <li
              key={s.noradId}
              onMouseDown={() => {
                setSelectedId(s.noradId);
                setSearchQuery(s.name);
              }}
            >
              <span className="sug-name">{s.name}</span>
              <span className="sug-meta">
                #{s.noradId} · {s.orbitClass}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
