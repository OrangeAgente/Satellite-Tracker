import { useEffect, useState, type ReactNode } from "react";
import { useApp } from "../store";
import { useSimClock } from "../hooks/useSimClock";
import { Scene } from "../globe/Scene";
import type { Satellite } from "../types";
import type { PropagationClient } from "../propagation/propagationClient";
import { MobileHud } from "./MobileHud";
import { InfoSheet } from "./InfoSheet";
import { CatalogPanel } from "./CatalogPanel";
import { fmtUTC, fmtOffset } from "./format";

const ACCENT = "#ffb547";

export type MobileTab = "globe" | "catalog" | "passes" | "agent";

interface TabDef {
  id: MobileTab;
  label: string;
  icon: ReactNode;
}

const TABS: TabDef[] = [
  {
    id: "globe",
    label: "GLOBE",
    icon: <path d="M9 1a8 8 0 100 16A8 8 0 009 1zM1 9h16M9 1c2.2 2.1 3.4 5 3.4 8s-1.2 5.9-3.4 8M9 1C6.8 3.1 5.6 6 5.6 9s1.2 5.9 3.4 8" />,
  },
  {
    id: "catalog",
    label: "CATALOG",
    icon: <g><line x1="2" y1="4" x2="16" y2="4" /><line x1="2" y1="9" x2="16" y2="9" /><line x1="2" y1="14" x2="16" y2="14" /></g>,
  },
  {
    id: "passes",
    label: "PASSES",
    icon: <g><circle cx="9" cy="9" r="7.5" /><path d="M9 9l5-3" /><circle cx="9" cy="9" r="1.4" fill="currentColor" stroke="none" /></g>,
  },
  {
    id: "agent",
    label: "AGENT",
    icon: <path d="M2 3h14v9H7l-4 3v-3H2z" />,
  },
];

interface Props {
  satellites: Satellite[];
  visibleIds: Set<number>;
  client: PropagationClient | null;
}

export function MobileApp({ satellites, visibleIds, client }: Props) {
  const [tab, setTab] = useState<MobileTab>("globe");
  const [searchOpen, setSearchOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const sel = useApp((s) => (s.selectedId != null ? s.getSatellite(s.selectedId) : undefined));
  const filters = useApp((s) => s.filters);
  const simTime = useApp((s) => s.simTime);
  const playRate = useApp((s) => s.playRate);
  const pinnedIds = useApp((s) => s.pinnedIds);
  const trackingId = useApp((s) => s.trackingId);
  const setSelectedId = useApp((s) => s.setSelectedId);
  const togglePin = useApp((s) => s.togglePin);
  const setTrackingId = useApp((s) => s.setTrackingId);

  useSimClock();

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const activeFilterCount =
    filters.orbitClasses.size + filters.users.size + filters.objectTypes.size;
  const simDisplay = simTime == null ? "LIVE" : fmtOffset(simTime - Date.now());

  const pickSat = (id: number) => {
    setSelectedId(id);
    setTab("globe");
    setSheetExpanded(false);
    setSearchOpen(false);
  };

  return (
    <div className="m-root">
      {/* globe backdrop */}
      <div className="m-globe-layer">
        {client && <Scene satellites={satellites} visibleIds={visibleIds} client={client} />}
      </div>
      <MobileHud />

      {/* top status strip */}
      <header className="m-top">
        <div className="m-logo"><span className="glyph">▲</span>SATCOM·OPS</div>
        <div className="m-top-right">
          <span className="m-live"><i />LIVE</span>
          <button className="m-icon" onClick={() => setSearchOpen(true)} aria-label="Search">
            <svg width="15" height="15" viewBox="0 0 15 15">
              <circle cx="6" cy="6" r="4.5" fill="none" stroke={ACCENT} strokeWidth="1.4" />
              <line x1="9.5" y1="9.5" x2="14" y2="14" stroke={ACCENT} strokeWidth="1.4" />
            </svg>
          </button>
        </div>
      </header>
      <div className="m-clockline">
        <span className="dim">UTC</span> {fmtUTC(now)}
        <span className="m-tracked">{visibleIds.size}<span className="dim">/{satellites.length}</span></span>
      </div>

      {/* floating sim pill */}
      {tab === "globe" && !searchOpen && (
        <button
          className={"m-simpill" + (simTime == null ? " live" : "")}
          onClick={() => setTimelineOpen(true)}
        >
          <span className="dim">SIM</span> {simDisplay}
          <span className="m-simpill-rate">{playRate}×</span>
        </button>
      )}

      {/* info sheet — globe tab with a selection */}
      {tab === "globe" && sel && (
        <InfoSheet
          sat={sel}
          expanded={sheetExpanded}
          onToggle={() => setSheetExpanded((e) => !e)}
          onExpand={() => setSheetExpanded(true)}
          onClose={() => setSelectedId(null)}
          pinned={pinnedIds.includes(sel.noradId)}
          onPin={() => togglePin(sel.noradId)}
          tracking={trackingId === sel.noradId}
          onTrack={() => setTrackingId(trackingId === sel.noradId ? null : sel.noradId)}
          onAgent={() => { setTab("agent"); setSheetExpanded(false); }}
          atMs={simTime ?? now}
        />
      )}

      {/* panels (filled in by later tasks) */}
      {tab === "catalog" && <CatalogPanel satellites={satellites} visibleIds={visibleIds} onPick={pickSat} />}
      {tab === "passes" && <PanelStub title="Upcoming passes" />}
      {tab === "agent" && <PanelStub title="Agent" />}

      {/* tab bar */}
      <nav className="m-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={"m-tab" + (tab === t.id ? " on" : "")} onClick={() => setTab(t.id)}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              {t.icon}
            </svg>
            <span>{t.label}</span>
            {t.id === "catalog" && activeFilterCount > 0 && <span className="m-tab-badge">{activeFilterCount}</span>}
          </button>
        ))}
      </nav>

      {/* placeholders wired in later tasks: InfoSheet, CompareTray, TimelineSheet, SearchOverlay */}
      {timelineOpen && <div className="m-scrim" onClick={() => setTimelineOpen(false)} />}
      {searchOpen && <div className="m-search-ov" onClick={() => setSearchOpen(false)} />}
    </div>
  );
}

function PanelStub({ title }: { title: string }) {
  return (
    <section className="m-panel">
      <div className="m-panel-h"><span>{title}</span></div>
      <div className="m-more">…</div>
    </section>
  );
}
