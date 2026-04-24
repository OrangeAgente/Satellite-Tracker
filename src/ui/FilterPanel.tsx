import { useMemo, useState } from "react";
import { useApp } from "../store";
import type { FilterState, OrbitClass, Satellite } from "../types";

interface Props {
  satellites: Satellite[];
}

type Dim = keyof FilterState;

const ORBITS: OrbitClass[] = ["LEO", "MEO", "GEO", "HEO"];
const OBJECT_TYPES = ["PAY", "R/B", "DEB", "UNK"];
const USER_BUCKETS = ["Military", "Government", "Commercial", "Civil"];

function buildOptions(satellites: Satellite[]) {
  const countries = new Map<string, number>();
  const categories = new Map<string, number>();
  for (const s of satellites) {
    const country = s.ucs?.operatorCountry || s.country;
    if (country) countries.set(country, (countries.get(country) || 0) + 1);
    for (const c of s.categories) categories.set(c, (categories.get(c) || 0) + 1);
  }
  const countrySorted = [...countries.entries()].sort((a, b) => b[1] - a[1]);
  const categorySorted = [...categories.entries()].sort((a, b) => b[1] - a[1]);
  return { countrySorted, categorySorted };
}

export function FilterPanel({ satellites }: Props) {
  const filters = useApp((s) => s.filters);
  const toggleFilter = useApp((s) => s.toggleFilter);
  const clearAllFilters = useApp((s) => s.clearAllFilters);
  const [open, setOpen] = useState(true);
  const [countryQuery, setCountryQuery] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");

  const { countrySorted, categorySorted } = useMemo(() => buildOptions(satellites), [satellites]);

  const filteredCountries = countrySorted.filter(([c]) =>
    c.toLowerCase().includes(countryQuery.toLowerCase()),
  );
  const filteredCategories = categorySorted.filter(([c]) =>
    c.toLowerCase().includes(categoryQuery.toLowerCase()),
  );

  const activeCount =
    filters.users.size +
    filters.countries.size +
    filters.orbitClasses.size +
    filters.categories.size +
    filters.objectTypes.size;

  return (
    <section className={`filters ${open ? "open" : "closed"}`}>
      <header>
        <button className="toggle" onClick={() => setOpen((o) => !o)}>
          Filters {activeCount > 0 && <span className="badge">{activeCount}</span>}
        </button>
        {activeCount > 0 && (
          <button className="clear" onClick={clearAllFilters}>
            Clear all
          </button>
        )}
      </header>
      {open && (
        <div className="filters-body">
          <Group
            title="Users (UCS)"
            dim="users"
            options={USER_BUCKETS.map((u) => [u, null] as [string, number | null])}
            filters={filters}
            toggle={toggleFilter}
          />
          <Group
            title="Orbit class"
            dim="orbitClasses"
            options={ORBITS.map((o) => [o, null] as [string, number | null])}
            filters={filters}
            toggle={toggleFilter}
          />
          <Group
            title="Object type"
            dim="objectTypes"
            options={OBJECT_TYPES.map((t) => [t, null] as [string, number | null])}
            filters={filters}
            toggle={toggleFilter}
          />
          <details open>
            <summary>Country (operator)</summary>
            <input
              type="search"
              placeholder="Filter list…"
              value={countryQuery}
              onChange={(e) => setCountryQuery(e.target.value)}
            />
            <div className="chip-list scroll">
              {filteredCountries.slice(0, 120).map(([val, n]) => (
                <Chip
                  key={val}
                  label={val}
                  count={n}
                  active={filters.countries.has(val)}
                  onClick={() => toggleFilter("countries", val)}
                />
              ))}
            </div>
          </details>
          <details>
            <summary>CelesTrak category</summary>
            <input
              type="search"
              placeholder="Filter list…"
              value={categoryQuery}
              onChange={(e) => setCategoryQuery(e.target.value)}
            />
            <div className="chip-list scroll">
              {filteredCategories.map(([val, n]) => (
                <Chip
                  key={val}
                  label={val}
                  count={n}
                  active={filters.categories.has(val)}
                  onClick={() => toggleFilter("categories", val)}
                />
              ))}
            </div>
          </details>
        </div>
      )}
    </section>
  );
}

function Group({
  title,
  dim,
  options,
  filters,
  toggle,
}: {
  title: string;
  dim: Dim;
  options: [string, number | null][];
  filters: FilterState;
  toggle: (dim: Dim, v: string) => void;
}) {
  const set = filters[dim] as Set<string>;
  return (
    <div className="filter-group">
      <div className="filter-group-title">{title}</div>
      <div className="chip-list">
        {options.map(([val, n]) => (
          <Chip
            key={val}
            label={val}
            count={n}
            active={set.has(val)}
            onClick={() => toggle(dim, val)}
          />
        ))}
      </div>
    </div>
  );
}

function Chip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`chip ${active ? "active" : ""}`} onClick={onClick}>
      {label}
      {count != null && <span className="chip-count">{count}</span>}
    </button>
  );
}
