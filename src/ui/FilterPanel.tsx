import { useMemo, useState } from "react";
import { useApp } from "../store";
import type { OrbitClass, Satellite } from "../types";
import { inferUsage, type UsageBucket } from "../data/usage";

interface Props {
  satellites: Satellite[];
}

const ORBITS: OrbitClass[] = ["LEO", "MEO", "GEO", "HEO"];
const ORBIT_SWATCH: Record<OrbitClass, string> = {
  LEO: "var(--orb-leo)",
  MEO: "var(--orb-meo)",
  GEO: "var(--orb-geo)",
  HEO: "var(--orb-heo)",
  UNK: "var(--orb-unk)",
};
const USER_BUCKETS: UsageBucket[] = ["Civil", "Commercial", "Government", "Military"];
const OBJECT_TYPES = ["PAY", "R/B", "DEB", "UNK"];

function buildOptions(satellites: Satellite[]) {
  const countries = new Map<string, number>();
  const categories = new Map<string, number>();
  const orbits: Record<string, number> = {};
  const types: Record<string, number> = {};
  const usage: Record<string, number> = { Civil: 0, Commercial: 0, Government: 0, Military: 0 };
  for (const s of satellites) {
    const country = s.ucs?.operatorCountry || s.country;
    if (country) countries.set(country, (countries.get(country) || 0) + 1);
    for (const c of s.categories) categories.set(c, (categories.get(c) || 0) + 1);
    orbits[s.orbitClass] = (orbits[s.orbitClass] ?? 0) + 1;
    types[s.objectType] = (types[s.objectType] ?? 0) + 1;
    for (const u of inferUsage(s)) usage[u] = (usage[u] ?? 0) + 1;
  }
  return {
    countrySorted: [...countries.entries()].sort((a, b) => b[1] - a[1]),
    categorySorted: [...categories.entries()].sort((a, b) => b[1] - a[1]),
    orbits,
    types,
    usage,
  };
}

export function FilterPanel({ satellites }: Props) {
  const filters = useApp((s) => s.filters);
  const toggleFilter = useApp((s) => s.toggleFilter);
  const clearAllFilters = useApp((s) => s.clearAllFilters);
  const [countryQuery, setCountryQuery] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");

  const opts = useMemo(() => buildOptions(satellites), [satellites]);

  const filteredCountries = opts.countrySorted.filter(([c]) =>
    c.toLowerCase().includes(countryQuery.toLowerCase()),
  );
  const filteredCategories = opts.categorySorted.filter(([c]) =>
    c.toLowerCase().includes(categoryQuery.toLowerCase()),
  );

  const activeCount =
    filters.users.size +
    filters.countries.size +
    filters.orbitClasses.size +
    filters.categories.size +
    filters.objectTypes.size;

  return (
    <section className="ops-section">
      <div className="ops-section-h">
        <span>Filters</span>
        {activeCount > 0 ? (
          <button className="ops-filter-clear" onClick={clearAllFilters}>
            CLEAR · {activeCount}
          </button>
        ) : (
          <span className="right">—</span>
        )}
      </div>

      <div className="ops-filter-row">
        <span className="ops-flbl">ORBIT</span>
        <div className="ops-pills">
          {ORBITS.map((o) => (
            <Pill
              key={o}
              label={o}
              count={opts.orbits[o] ?? 0}
              swatch={ORBIT_SWATCH[o]}
              active={filters.orbitClasses.has(o)}
              onClick={() => toggleFilter("orbitClasses", o)}
            />
          ))}
        </div>
      </div>

      <div className="ops-filter-row">
        <span className="ops-flbl">USAGE</span>
        <div className="ops-pills">
          {USER_BUCKETS.map((u) => (
            <Pill
              key={u}
              label={u}
              count={opts.usage[u] ?? 0}
              active={filters.users.has(u)}
              onClick={() => toggleFilter("users", u)}
            />
          ))}
        </div>
      </div>

      <div className="ops-filter-row">
        <span className="ops-flbl">TYPE</span>
        <div className="ops-pills">
          {OBJECT_TYPES.map((t) => (
            <Pill
              key={t}
              label={t}
              count={opts.types[t] ?? 0}
              active={filters.objectTypes.has(t)}
              onClick={() => toggleFilter("objectTypes", t)}
            />
          ))}
        </div>
      </div>

      <details className="ops-filter-extras">
        <summary>Country / operator</summary>
        <input
          type="search"
          placeholder="Filter list…"
          value={countryQuery}
          onChange={(e) => setCountryQuery(e.target.value)}
        />
        <div className="ops-pills ops-chip-scroll">
          {filteredCountries.slice(0, 120).map(([val, n]) => (
            <Pill
              key={val}
              label={val}
              count={n}
              active={filters.countries.has(val)}
              onClick={() => toggleFilter("countries", val)}
            />
          ))}
        </div>
      </details>

      <details className="ops-filter-extras">
        <summary>Category</summary>
        <input
          type="search"
          placeholder="Filter list…"
          value={categoryQuery}
          onChange={(e) => setCategoryQuery(e.target.value)}
        />
        <div className="ops-pills ops-chip-scroll">
          {filteredCategories.map(([val, n]) => (
            <Pill
              key={val}
              label={val}
              count={n}
              active={filters.categories.has(val)}
              onClick={() => toggleFilter("categories", val)}
            />
          ))}
        </div>
      </details>
    </section>
  );
}

function Pill({
  label,
  count,
  swatch,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  swatch?: string;
  active: boolean;
  onClick: () => void;
}) {
  const empty = count != null && count === 0;
  return (
    <button
      className={`ops-pill${active ? " on" : ""}${empty ? " empty" : ""}`}
      onClick={empty ? undefined : onClick}
      disabled={empty}
      title={empty ? `${label} — none in current dataset` : label}
    >
      {swatch && <i style={{ background: swatch }} />}
      {label}
      {count != null && <span className="ops-pill-count">{count.toLocaleString()}</span>}
    </button>
  );
}
