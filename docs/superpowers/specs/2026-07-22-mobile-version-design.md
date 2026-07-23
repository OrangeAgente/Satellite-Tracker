# Mobile version of the Ops Console — design

**Date:** 2026-07-22
**Status:** Approved (design), pending implementation plan
**Source design:** Claude Design project `Sat Tracker` (`019dc078-47c7-7c55-a745-af36bb3277d7`),
file `Satellite Tracker Mobile.html` and its companions (`mobile.jsx`, `mobile-styles.js`,
`globe.jsx`, `data.jsx`).

## Goal

Add a mobile version of the Satellite Tracker ("Ops Console") that appears automatically on
phone-sized viewports. It is a **real port** of the provided mobile design: the mobile UI is
rebuilt in TypeScript and wired to the app's real store, dataset, SGP4 propagation, and Cohere
agent — not a drop-in of the self-contained prototype (which used curated mock data, fake pass
math, and fake streamed agent replies).

## Decisions (locked)

1. **Integration depth:** Real port — reuse the live Zustand store, dataset, `PropagationClient`,
   passes predictor, and Cohere agent.
2. **Globe on mobile:** Reuse the existing three.js (`Scene`) WebGL globe as a full-screen
   backdrop. Do **not** use the prototype's SVG globe.
3. **Entry:** Auto-switch by viewport (`matchMedia`), single URL, shared store.
4. **Breakpoint:** `max-width: 768px`.
5. **Ground track:** Real, lightweight SGP4 sub-satellite track (not the prototype's fake sinusoid,
   not dropped).

## Why this maps cleanly

- The desktop `src/styles.css` already defines every CSS variable the prototype's
  `mobile-styles.js` uses (`--ops-bg`, `--ops-hot`, `--ops-fg-dim`, `--ops-line`,
  `--orb-leo/meo/geo/heo`, `--ops-mono`, …). The mobile CSS reuses the existing `:root`; the
  prototype's duplicated `:root` block is dropped.
- The prototype's HUD chrome (corner brackets, INC/ALT/PER + CLASS/MODE readouts, scale bar) is
  nearly identical to the desktop `HudOverlay`.
- The store already holds all state the mobile UI needs: `selectedId`, `filters`
  (`orbitClasses`/`users`/`objectTypes`/`countries`/`categories`), `searchQuery`, `pinnedIds`,
  `simTime`/`playing`/`playRate`, `observer`, `trackingId`, `hudVisible`.

## Architecture

### Entry & layout switch
- `src/hooks/useIsMobile.ts` — `matchMedia("(max-width: 768px)")`, subscribed for reactive
  updates on resize/orientation.
- `src/App.tsx` — keep all data setup (dataset load, `PropagationClient` init, live refresh,
  `computeVisibleIds`) above a layout branch. After data is ready:
  `isMobile ? <MobileApp satellites … visibleIds … client … /> : <existing desktop shell>`.
  Splash / error / empty states unchanged. Both layouts share the **same store instance and the
  same `PropagationClient`**, so state stays consistent across a resize that flips layouts.
- `index.html` — add `viewport-fit=cover` to the viewport meta. Mobile CSS honors
  `env(safe-area-inset-*)` (tab bar bottom padding, top strip).

### Globe backdrop (three.js reuse)
- Render the existing `Scene` as a fixed, full-screen backdrop behind the mobile chrome.
  Touch already works: OrbitControls (one-finger rotate, pinch-zoom) + the existing tap-to-select
  click-picking in `Satellites`. No on-screen zoom buttons on mobile (pinch instead).
- `src/mobile/MobileHud.tsx` — mobile-positioned variant of `HudOverlay`: corner brackets, the two
  HUD readout blocks, and the scale bar, offset to clear the top strip and bottom tab bar. Reads
  the selected sat from the store like `HudOverlay` does.

### Shell & navigation
- `src/mobile/MobileApp.tsx` — composes: globe backdrop + `MobileHud`, top strip
  (`▲ SATCOM·OPS`, LIVE dot, search icon), clock line (UTC + visible/total), floating SIM pill,
  bottom tab bar (GLOBE / CATALOG / PASSES / AGENT with filter-count badge), and the active panel.
  The active tab is local `useState` (view state). Everything else reads/writes the store.

### Panels (all wired to real data)
- `src/mobile/InfoSheet.tsx` — globe tab, shown when a sat is selected. Collapse/expand drag
  handle, stat grid, action row → PIN (`togglePin`), TRACK (`setTrackingId`), INFO, TLE (shows the
  real `tleLine1`/`tleLine2`), and "QUERY THIS SATELLITE →" which switches to the Agent tab.
  Mission KV list from `ucs` + `inferUsage`. Ground-track mini-map is the real SGP4 track.
- `src/mobile/CatalogPanel.tsx` — ORBIT/USAGE/TYPE filter pills → `toggleFilter` on
  `orbitClasses`/`users`/`objectTypes`; CLEAR → `clearAllFilters`; list driven by
  `computeVisibleIds` (cap rendered rows like desktop `Catalog`); tap selects + returns to globe.
- `src/mobile/PassesPanel.tsx` — observer editor bound to `store.observer` (`latDeg`/`lonDeg`/
  `altKm`); real passes via `predictPasses` (when a sat is selected) / `predictNextPasses` (fleet
  subset, capped for perf — mirror desktop `UpcomingPasses`'s sat-limiting); `compassDir` for
  AOS/LOS azimuth. Recompute in a memo keyed on selection/observer/sim time.
- `src/mobile/AgentPanel.tsx` — real Cohere agent via the shared `useAgentConversation` hook:
  dynamic + static prompts, streaming, stop/reset, dev-mode key handling reused from the existing
  `cohere.ts` helpers (`isProxyOnly`/`getApiKey`/`setApiKey`).
- `src/mobile/TimelineSheet.tsx` — binds to store `simTime`/`playing`/`playRate`; scrub maps
  track position → `simTime` over a ±4h window (matches desktop `Timeline`).
- `src/mobile/SearchOverlay.tsx` — full-screen search bound to `searchQuery`, selects a sat.
- `src/mobile/CompareTray.tsx` — pins from `pinnedIds`.

### Shared refactors (in-scope — keep mobile & desktop single-source-of-truth)
- `src/agent/prompts.ts` — move `buildSystemPrompt` + `buildDynamicPrompts` (+ `STATIC_PROMPTS`)
  out of `ui/SatelliteAgent.tsx`.
- `src/agent/useAgentConversation.ts` — hook owning turns/streaming/prompts/send/cancel/reset/ready.
  Desktop `SatelliteAgent` refactors to consume it; `AgentPanel` consumes it too.
- `src/hooks/useSimClock.ts` — the RAF sim-advance loop extracted from `ui/Timeline.tsx`. Used by
  `MobileApp`; desktop `Timeline` switches to it (so the loop runs in whichever layout is mounted).
- `src/globe/groundTrack.ts` — pure helper: sample a sat's position over ~one period via
  `satellite.js`, convert ECI→geodetic, return lat/lon points for an equirectangular mini-map.

### Styling
- `src/mobile.css` — the prototype's `.m-*` classes, minus the duplicated `:root` block (reuse the
  existing palette). Imported from `main.tsx`. Fonts (JetBrains Mono / Inter) already loaded in
  `index.html`. Tab bar + top strip honor `env(safe-area-inset-*)`.

## Data field mapping (prototype mock → real `Satellite`)

| Prototype (`data.jsx`) | Real (`types.ts`) |
| --- | --- |
| `id` | `noradId` |
| `orbit` | `orbitClass` |
| `type` | `objectType` |
| `incl` | `inclinationDeg` |
| `period` | `periodMin` |
| `apo` / `per` | `apogeeKm` / `perigeeKm` |
| `cat` | `categories` |
| `launch` | `launchDate` |
| `operator` / `users` / `mass` | `ucs.operator` / `inferUsage()` / `ucs.launchMassKg` |
| `intlDes` | `intlDes` |

Orbit colors come from the `--orb-*` CSS variables. Small formatting helpers (period h/m, etc.)
live inline or in a tiny `src/mobile/format.ts`.

## Non-goals (YAGNI)
- No SVG globe (three.js reused instead).
- No PWA / offline / installability.
- No separate mobile route or manual toggle.
- No new dependencies.
- No changes to the Cohere proxy, dataset build, or deploy flow.

## Verification
The repo has **no test runner** (package.json scripts: dev / build / build:data / preview /
typecheck). Verification is therefore:
- `npm run typecheck` — clean.
- `npm run build` — succeeds.
- Manual, in a phone-sized viewport (Chrome device emulation / driven browser at ~402×874):
  walk each tab; select on the globe and confirm the InfoSheet + HUD update; PIN/TRACK; run a
  filter and confirm the catalog + globe visibility + tab badge; edit the observer and confirm
  passes recompute; scrub the timeline and confirm the globe animates; send an agent query and
  confirm it streams through the proxy; resize across 768px and confirm selection/filter/pin state
  carries over both directions.

## Affected / new files

**New**
- `src/hooks/useIsMobile.ts`, `src/hooks/useSimClock.ts`
- `src/agent/prompts.ts`, `src/agent/useAgentConversation.ts`
- `src/globe/groundTrack.ts`
- `src/mobile/MobileApp.tsx`, `MobileHud.tsx`, `InfoSheet.tsx`, `CatalogPanel.tsx`,
  `PassesPanel.tsx`, `AgentPanel.tsx`, `TimelineSheet.tsx`, `SearchOverlay.tsx`, `CompareTray.tsx`,
  `format.ts`
- `src/mobile.css`

**Modified**
- `src/App.tsx` (layout branch), `index.html` (viewport-fit), `src/main.tsx` (import mobile.css)
- `src/ui/SatelliteAgent.tsx` (consume shared hook), `src/ui/Timeline.tsx` (consume `useSimClock`)
