import { create } from "zustand";
import type { Dataset, FilterState, OrbitClass, Satellite } from "./types";
import { DEFAULT_OBSERVER, type Observer } from "./passes/predictor";
import { matchesUsage } from "./data/usage";

export type PlayRate = 0.5 | 1 | 2 | 4 | 16 | 64;

interface AppState {
  dataset: Dataset | null;
  loading: boolean;
  loadError: string | null;
  selectedId: number | null;
  hoveredId: number | null;
  searchQuery: string;
  filters: FilterState;
  lastRefreshAt: string | null;

  pinnedIds: number[];
  simTime: number | null;
  playing: boolean;
  playRate: PlayRate;
  trackingId: number | null;
  hudVisible: boolean;
  observer: Observer;

  setDataset: (d: Dataset) => void;
  setLoading: (b: boolean) => void;
  setLoadError: (s: string | null) => void;
  setSelectedId: (id: number | null) => void;
  setHoveredId: (id: number | null) => void;
  setSearchQuery: (q: string) => void;
  toggleFilter: (dim: keyof FilterState, value: string) => void;
  clearFilter: (dim: keyof FilterState) => void;
  clearAllFilters: () => void;
  setLastRefreshAt: (s: string) => void;
  getSatellite: (id: number) => Satellite | undefined;

  togglePin: (id: number) => void;
  setSimTime: (t: number | null) => void;
  setPlaying: (b: boolean) => void;
  setPlayRate: (r: PlayRate) => void;
  setTrackingId: (id: number | null) => void;
  toggleHud: () => void;
  setObserver: (o: Observer) => void;
}

const emptyFilters = (): FilterState => ({
  users: new Set(),
  countries: new Set(),
  orbitClasses: new Set<OrbitClass>(),
  categories: new Set(),
  objectTypes: new Set(),
});

export const useApp = create<AppState>((set, get) => ({
  dataset: null,
  loading: true,
  loadError: null,
  selectedId: null,
  hoveredId: null,
  searchQuery: "",
  filters: emptyFilters(),
  lastRefreshAt: null,

  pinnedIds: [],
  simTime: null,
  playing: true,
  playRate: 1,
  trackingId: null,
  hudVisible: true,
  observer: DEFAULT_OBSERVER,

  setDataset: (dataset) => set({ dataset, loading: false, loadError: null }),
  setLoading: (loading) => set({ loading }),
  setLoadError: (loadError) => set({ loadError, loading: false }),
  setSelectedId: (selectedId) => set({ selectedId }),
  setHoveredId: (hoveredId) => set({ hoveredId }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  toggleFilter: (dim, value) =>
    set((state) => {
      const next = { ...state.filters };
      const cur = new Set(state.filters[dim] as Set<string>);
      if (cur.has(value)) cur.delete(value);
      else cur.add(value);
      (next[dim] as Set<string>) = cur;
      return { filters: next };
    }),
  clearFilter: (dim) =>
    set((state) => {
      const next = { ...state.filters };
      (next[dim] as Set<string>) = new Set();
      return { filters: next };
    }),
  clearAllFilters: () => set({ filters: emptyFilters() }),
  setLastRefreshAt: (lastRefreshAt) => set({ lastRefreshAt }),
  getSatellite: (id) => get().dataset?.satellites.find((s) => s.noradId === id),

  togglePin: (id) =>
    set((state) => {
      const has = state.pinnedIds.includes(id);
      return { pinnedIds: has ? state.pinnedIds.filter((x) => x !== id) : [...state.pinnedIds, id] };
    }),
  setSimTime: (simTime) => set({ simTime }),
  setPlaying: (playing) => set({ playing }),
  setPlayRate: (playRate) => set({ playRate }),
  setTrackingId: (trackingId) => set({ trackingId }),
  toggleHud: () => set((s) => ({ hudVisible: !s.hudVisible })),
  setObserver: (observer) => set({ observer }),
}));

/** Derived: the set of NORAD ids that currently match filters + search. */
export function computeVisibleIds(state: AppState): Set<number> {
  const { dataset, filters, searchQuery } = state;
  if (!dataset) return new Set();
  const q = searchQuery.trim().toLowerCase();
  const anyUser = filters.users.size > 0;
  const anyCountry = filters.countries.size > 0;
  const anyOrbit = filters.orbitClasses.size > 0;
  const anyCat = filters.categories.size > 0;
  const anyType = filters.objectTypes.size > 0;
  const out = new Set<number>();
  for (const s of dataset.satellites) {
    if (anyUser && !matchesUsage(s, filters.users)) continue;
    if (anyCountry) {
      const country = (s.ucs?.operatorCountry || s.country || "").toLowerCase();
      let match = false;
      for (const c of filters.countries) {
        if (country.includes(c.toLowerCase())) {
          match = true;
          break;
        }
      }
      if (!match) continue;
    }
    if (anyOrbit && !filters.orbitClasses.has(s.orbitClass)) continue;
    if (anyCat) {
      let match = false;
      for (const c of filters.categories) {
        if (s.categories.includes(c)) {
          match = true;
          break;
        }
      }
      if (!match) continue;
    }
    if (anyType && !filters.objectTypes.has(s.objectType)) continue;
    if (q) {
      const hay = `${s.name} ${s.noradId} ${s.intlDes}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    out.add(s.noradId);
  }
  return out;
}
