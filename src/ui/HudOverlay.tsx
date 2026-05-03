import { useEffect } from "react";
import { useApp } from "../store";

export function HudOverlay() {
  const sel = useApp((s) => (s.selectedId != null ? s.getSatellite(s.selectedId) : undefined));
  const hudVisible = useApp((s) => s.hudVisible);
  const toggleHud = useApp((s) => s.toggleHud);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key.toLowerCase() === "h") toggleHud();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleHud]);

  if (!hudVisible) return null;

  const lat = sel?.inclinationDeg != null ? `${sel.inclinationDeg.toFixed(2)}°` : "—";
  const altKm = sel?.apogeeKm ?? sel?.perigeeKm;
  const alt = altKm != null ? `${altKm.toLocaleString()} km` : "—";
  const period = sel?.periodMin != null ? `${sel.periodMin.toFixed(1)} m` : "—";
  const orb = sel?.orbitClass ?? "—";

  return (
    <>
      <span className="ops-bracket tl" />
      <span className="ops-bracket tr" />
      <span className="ops-bracket bl" />
      <span className="ops-bracket br" />

      <div className="ops-hud tl">
        <div>
          <span className="label">INC</span>
          <span className="value">{lat}</span>
        </div>
        <div>
          <span className="label">ALT</span>
          <span className="value">{alt}</span>
        </div>
        <div>
          <span className="label">PER</span>
          <span className="value">{period}</span>
        </div>
      </div>

      <div className="ops-hud tr">
        <div>
          <span className="label">CLASS</span>
          <span className="value">{orb}</span>
        </div>
        <div>
          <span className="label">FOV</span>
          <span className="value">42°</span>
        </div>
        <div>
          <span className="label">MODE</span>
          <span className="value">{sel ? "TRACK" : "WIDE"}</span>
        </div>
      </div>

      <div className="ops-hud-scale">├──── 1000 km ────┤</div>

      <ZoomButtons />
    </>
  );
}

function ZoomButtons() {
  const dispatchZoom = (delta: number) =>
    window.dispatchEvent(new CustomEvent("ops-zoom", { detail: { delta } }));
  return (
    <div className="ops-hud-zoom">
      <button onClick={() => dispatchZoom(-0.2)} aria-label="Zoom in">+</button>
      <button onClick={() => dispatchZoom(0.2)} aria-label="Zoom out">−</button>
      <button onClick={() => window.dispatchEvent(new CustomEvent("ops-zoom-reset"))} aria-label="Reset">⌂</button>
    </div>
  );
}
