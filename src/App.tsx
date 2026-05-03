import { useEffect, useMemo, useState } from "react";
import { useApp, computeVisibleIds } from "./store";
import { loadDataset } from "./data/loadDataset";
import { startLiveRefresh } from "./data/refresh";
import { Scene } from "./globe/Scene";
import { TopBar } from "./ui/TopBar";
import { FilterPanel } from "./ui/FilterPanel";
import { Catalog } from "./ui/Catalog";
import { InfoPanel } from "./ui/InfoPanel";
import { UpcomingPasses } from "./ui/UpcomingPasses";
import { SatelliteAgent } from "./ui/SatelliteAgent";
import { HudOverlay } from "./ui/HudOverlay";
import { Timeline } from "./ui/Timeline";
import { CompareTray } from "./ui/CompareTray";
import { PropagationClient } from "./propagation/propagationClient";

export function App() {
  const dataset = useApp((s) => s.dataset);
  const loading = useApp((s) => s.loading);
  const loadError = useApp((s) => s.loadError);
  const setDataset = useApp((s) => s.setDataset);
  const setLoadError = useApp((s) => s.setLoadError);
  const filters = useApp((s) => s.filters);
  const searchQuery = useApp((s) => s.searchQuery);
  const setLastRefreshAt = useApp((s) => s.setLastRefreshAt);

  const [client, setClient] = useState<PropagationClient | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadDataset()
      .then((d) => {
        if (!cancelled) setDataset(d);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [setDataset, setLoadError]);

  useEffect(() => {
    if (!dataset || dataset.satellites.length === 0) return;
    const c = new PropagationClient(250);
    c.setTimeProvider(() => {
      const { simTime } = useApp.getState();
      return simTime ?? Date.now();
    });
    c.init(dataset.satellites);
    setClient(c);
    return () => {
      c.dispose();
      setClient(null);
    };
  }, [dataset]);

  useEffect(() => {
    if (!client) return;
    const stop = startLiveRefresh(client, setLastRefreshAt);
    return stop;
  }, [client, setLastRefreshAt]);

  const visibleIds = useMemo(
    () => computeVisibleIds({ dataset, filters, searchQuery } as Parameters<typeof computeVisibleIds>[0]),
    [dataset, filters, searchQuery],
  );

  if (loadError) {
    return (
      <div className="splash error">
        <h1>Couldn't load the dataset</h1>
        <p>{loadError}</p>
        <p className="hint">
          Run <code>docker compose run --rm app npm run build:data</code> to generate{" "}
          <code>public/data/satellites.json</code>, then reload.
        </p>
      </div>
    );
  }

  if (loading || !dataset) {
    return (
      <div className="splash">
        <div className="spinner" />
        <h1>Loading satellite catalog…</h1>
      </div>
    );
  }

  if (dataset.count === 0) {
    return (
      <div className="splash error">
        <h1>Dataset is empty</h1>
        <p>
          <code>public/data/satellites.json</code> was generated but contains no satellites. This usually
          means the build ran without network access. Run:
        </p>
        <pre>docker compose run --rm app npm run build:data</pre>
      </div>
    );
  }

  return (
    <div className="ops-root">
      <TopBar satellites={dataset.satellites} total={dataset.count} visible={visibleIds.size} />
      <div className="ops-body">
        <aside className="ops-left">
          <FilterPanel satellites={dataset.satellites} />
          <Catalog satellites={dataset.satellites} visibleIds={visibleIds} />
        </aside>
        <main className="ops-center">
          <div className="ops-globe">
            {client && <Scene satellites={dataset.satellites} visibleIds={visibleIds} client={client} />}
            <HudOverlay />
          </div>
          <CompareTray />
        </main>
        <aside className="ops-right">
          <InfoPanel />
          <UpcomingPasses satellites={dataset.satellites} />
          <SatelliteAgent />
        </aside>
      </div>
      <Timeline />
    </div>
  );
}
