import { useApp } from "../store";
import { fmtPeriod } from "./format";

/**
 * Mobile HUD chrome: corner brackets, two readout blocks, and the scale bar,
 * framing the globe viewport. Mirrors the desktop HudOverlay but positioned
 * for the phone layout. Pointer-transparent (see `.m-stage` in mobile.css).
 */
export function MobileHud() {
  const sel = useApp((s) => (s.selectedId != null ? s.getSatellite(s.selectedId) : undefined));
  const trackingId = useApp((s) => s.trackingId);

  const inc = sel?.inclinationDeg != null ? `${sel.inclinationDeg.toFixed(2)}°` : "—";
  const altKm = sel?.apogeeKm ?? sel?.perigeeKm;
  const alt = altKm != null ? `${altKm.toLocaleString()} km` : "—";
  const per = fmtPeriod(sel?.periodMin);
  const mode = trackingId ? "TRACK" : sel ? "SEL" : "WIDE";

  return (
    <div className="m-stage" aria-hidden="true">
      <span className="m-bracket tl" />
      <span className="m-bracket tr" />
      <span className="m-bracket bl" />
      <span className="m-bracket br" />
      <div className="m-hud tl">
        <div><span className="hl">INC</span><span className="hv">{inc}</span></div>
        <div><span className="hl">ALT</span><span className="hv">{alt}</span></div>
        <div><span className="hl">PER</span><span className="hv">{per}</span></div>
      </div>
      <div className="m-hud tr">
        <div><span className="hl">CLASS</span><span className="hv">{sel ? sel.orbitClass : "—"}</span></div>
        <div><span className="hl">MODE</span><span className="hv">{mode}</span></div>
      </div>
      <div className="m-scale">├──── 1000 km ────┤</div>
    </div>
  );
}
