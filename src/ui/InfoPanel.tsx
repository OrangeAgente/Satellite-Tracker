import { useApp } from "../store";

export function InfoPanel() {
  const sel = useApp((s) => (s.selectedId != null ? s.getSatellite(s.selectedId) : undefined));
  const setSelectedId = useApp((s) => s.setSelectedId);
  if (!sel) return null;
  const ucs = sel.ucs;
  return (
    <aside className="info">
      <header>
        <div>
          <div className="info-title">{sel.name}</div>
          <div className="info-sub">
            NORAD #{sel.noradId} · {sel.intlDes || "—"} · {sel.objectType}
          </div>
        </div>
        <button onClick={() => setSelectedId(null)} className="close" aria-label="Close">
          ×
        </button>
      </header>
      <dl>
        <Row k="Orbit" v={`${sel.orbitClass}`} />
        <Row k="Period" v={sel.periodMin ? `${sel.periodMin.toFixed(1)} min` : "—"} />
        <Row k="Inclination" v={sel.inclinationDeg != null ? `${sel.inclinationDeg.toFixed(1)}°` : "—"} />
        <Row k="Apogee / Perigee" v={`${sel.apogeeKm ?? "—"} / ${sel.perigeeKm ?? "—"} km`} />
        <Row k="Country" v={ucs?.operatorCountry || sel.country || "—"} />
        <Row k="Launch" v={sel.launchDate || "—"} />
        {sel.categories.length > 0 && (
          <Row k="Categories" v={sel.categories.join(", ")} />
        )}
      </dl>
      {ucs && (
        <>
          <h4>UCS metadata</h4>
          <dl>
            <Row k="Users" v={ucs.users} />
            <Row k="Purpose" v={ucs.purpose} />
            <Row k="Detailed purpose" v={ucs.detailedPurpose} />
            <Row k="Operator" v={ucs.operator} />
            <Row k="Contractor" v={ucs.contractor} />
            <Row k="Launch mass" v={ucs.launchMassKg ? `${ucs.launchMassKg} kg` : undefined} />
            <Row k="Dry mass" v={ucs.dryMassKg ? `${ucs.dryMassKg} kg` : undefined} />
            <Row k="Power" v={ucs.powerW ? `${ucs.powerW} W` : undefined} />
            <Row k="Expected lifetime" v={ucs.expectedLifetimeYears ? `${ucs.expectedLifetimeYears} yr` : undefined} />
            <Row k="Launch site" v={ucs.launchSite} />
            <Row k="Launch vehicle" v={ucs.launchVehicle} />
          </dl>
        </>
      )}
      <footer className="info-links">
        <a href={`https://celestrak.org/satcat/tle.php?CATNR=${sel.noradId}`} target="_blank" rel="noreferrer">
          CelesTrak
        </a>
        <a href={`https://www.n2yo.com/satellite/?s=${sel.noradId}`} target="_blank" rel="noreferrer">
          N2YO
        </a>
      </footer>
    </aside>
  );
}

function Row({ k, v }: { k: string; v?: string | null }) {
  if (!v) return null;
  return (
    <div className="row">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
