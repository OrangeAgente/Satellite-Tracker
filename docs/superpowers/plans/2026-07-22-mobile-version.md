# Mobile Version Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an auto-switching mobile version of the Ops Console that ports the provided Claude
Design mobile prototype onto the app's real store, dataset, SGP4 propagation, and Cohere agent.

**Architecture:** `App.tsx` renders the existing desktop shell above `max-width: 768px` and a new
`MobileApp` at or below it, sharing one store and one `PropagationClient`. The mobile UI reuses the
three.js `Scene` as a full-screen backdrop and layers ops-console chrome (HUD, tabs, sheets) on top.
Agent/timeline logic is extracted into shared hooks so desktop and mobile stay single-source-of-truth.

**Tech Stack:** Vite 5, React 18, TypeScript, Zustand, three.js / @react-three/fiber, satellite.js.

## Global Constraints

- No new dependencies.
- No test runner in the repo → verification is `npm run typecheck`, `npm run build`, and manual
  checks in a phone-sized viewport. Every task ends with a clean `npm run typecheck`.
- Reuse the existing `:root` CSS palette in `src/styles.css`; do not re-declare it.
- Cohere model is unchanged; no touching the proxy, dataset build, or deploy flow.
- Prototype markup source of truth: Claude Design `Sat Tracker` `mobile.jsx` / `mobile-styles.js`.
  Apply the field mapping in the spec (`id→noradId`, `orbit→orbitClass`, `incl→inclinationDeg`,
  `apo→apogeeKm`, `per→perigeeKm`, `period→periodMin`, `type→objectType`, `cat→categories`,
  `launch→launchDate`, `operator/users/mass→ucs`/`inferUsage`).

---

### Task 1: Shared agent + sim-clock extraction (no behavior change)

Extract logic the mobile panels reuse, and refactor the desktop components to consume it so there's
one source of truth.

**Files:**
- Create: `src/agent/prompts.ts`, `src/agent/useAgentConversation.ts`
- Create: `src/hooks/useSimClock.ts`, `src/hooks/useIsMobile.ts`
- Modify: `src/ui/SatelliteAgent.tsx` (consume `useAgentConversation` + `prompts`)
- Modify: `src/ui/Timeline.tsx` (consume `useSimClock`)

**Interfaces produced:**
- `prompts.ts`: `buildSystemPrompt(sat: Satellite): string`, `buildDynamicPrompts(sat: Satellite):
  string[]`, `STATIC_PROMPTS: string[]`.
- `useAgentConversation.ts`: `useAgentConversation(sat: Satellite | undefined) => { turns: Turn[];
  streaming: boolean; ready: boolean; proxyOnly: boolean; apiKey: string|null; prompts: string[];
  send(text: string): void; cancel(): void; reset(): void; setKey(key: string|null, remember:
  boolean): void }` where `Turn = { role: "user"|"assistant"; text: string; error?: string }`.
- `useSimClock.ts`: `useSimClock(): void` — the RAF loop that advances `simTime` when
  `simTime != null && playing`, using a wall-clock base and `playRate`. Verbatim move of the effect
  in `Timeline.tsx:20-38`.
- `useIsMobile.ts`: `useIsMobile(query = "(max-width: 768px)"): boolean` — subscribes to
  `matchMedia` and updates on change.

- [ ] **Step 1:** Move `buildSystemPrompt`, `buildDynamicPrompts`, `STATIC_PROMPTS` from
  `SatelliteAgent.tsx` into `src/agent/prompts.ts` (verbatim, add imports for `Satellite`,
  `inferUsage`). Export them.
- [ ] **Step 2:** Create `useAgentConversation.ts` holding the `turns`/`streaming`/`input`-less
  send loop (the `send`/`cancel`/`reset` logic from `SatelliteAgent.tsx:85-176`), plus the dev-key
  state (`isProxyOnly`/`getApiKey`/`setApiKey`) and the `prompts` memo. It owns the reset-on-
  `sat?.noradId`-change effect. It does NOT own the text input value (panels keep their own input).
- [ ] **Step 3:** Refactor `SatelliteAgent.tsx` to call `useAgentConversation(sel)` and render its
  existing markup against the hook's return values; keep its local `input` state and key form.
- [ ] **Step 4:** Create `useSimClock.ts` by moving the RAF effect out of `Timeline.tsx`; call
  `useSimClock()` at the top of `Timeline`.
- [ ] **Step 5:** Create `useIsMobile.ts`.
- [ ] **Step 6:** `npm run typecheck` → clean. `npm run build` → succeeds.
- [ ] **Step 7:** Manual: `npm run dev`, desktop agent still streams a reply and the timeline still
  advances in sim mode.
- [ ] **Step 8:** Commit: `refactor: extract shared agent + sim-clock hooks`.

---

### Task 2: Ground-track helper

**Files:**
- Create: `src/globe/groundTrack.ts`

**Interfaces produced:**
- `groundTrackPoints(sat: Satellite, atMs: number, samples = 120): { lat: number; lon: number }[]`
  — samples the sat's position across ~one period (fallback 90 min if `periodMin` is null) via
  `satellite.twoline2satrec` + `propagate` + `eciToGeodetic`, returns geodetic degrees. Returns
  `[]` on `rec.error`.
- `subSatellitePoint(sat: Satellite, atMs: number): { lat: number; lon: number } | null` — current
  sub-satellite point.

- [ ] **Step 1:** Implement using `satellite.js` (already a dep), mirroring the propagate/gmst
  pattern in `src/passes/predictor.ts:37-44` but converting ECI→geodetic with
  `satellite.eciToGeodetic` and `satellite.degreesLat/degreesLong`.
- [ ] **Step 2:** `npm run typecheck` → clean.
- [ ] **Step 3:** Commit: `feat: add SGP4 ground-track helper`.

---

### Task 3: Mobile stylesheet

**Files:**
- Create: `src/mobile.css`
- Modify: `src/main.tsx` (add `import "./mobile.css";`)

- [ ] **Step 1:** Copy the `.m-*` rules from the prototype `mobile-styles.js` (`window.MOBILE_CSS`)
  into `src/mobile.css`, dropping the leading `:root{…}` block (reuse `styles.css` vars). Keep the
  `--mono` references pointing at the existing `--ops-mono`.
- [ ] **Step 2:** Replace the tab bar / top strip fixed `padding-bottom:20px` and `top:58px` device-
  frame offsets with `env(safe-area-inset-*)` additions (the prototype assumed an iOS frame; the
  real app is full-viewport).
- [ ] **Step 3:** `import "./mobile.css"` in `main.tsx`. `npm run typecheck` → clean.
- [ ] **Step 4:** Commit: `feat: add mobile stylesheet`.

---

### Task 4: Layout switch + MobileApp shell + globe backdrop + HUD

**Files:**
- Modify: `src/App.tsx` (branch on `useIsMobile()`)
- Modify: `index.html` (viewport `viewport-fit=cover`)
- Create: `src/mobile/MobileApp.tsx`, `src/mobile/MobileHud.tsx`, `src/mobile/format.ts`

**Interfaces:**
- Consumes: `Scene` (`{satellites, visibleIds, client}`), store selectors, `useSimClock`,
  `useIsMobile`.
- Produces: `MobileApp({satellites, visibleIds, client})`. `format.ts`:
  `fmtPeriod(min)`, `fmtUTC(ms)`, `orbitColor(orbitClass)`.

- [ ] **Step 1:** In `App.tsx`, after the dataset/client guards, compute `const isMobile =
  useIsMobile()` and `return isMobile ? <MobileApp satellites={dataset.satellites}
  visibleIds={visibleIds} client={client!} /> : (<existing .ops-root JSX>)`. Keep all hooks above
  the branch (no conditional hooks).
- [ ] **Step 2:** `format.ts` helpers (period h/m, UTC string, orbit color via `getComputedStyle`
  of `--orb-*` or a static map matching the CSS).
- [ ] **Step 3:** `MobileHud.tsx` — ported from prototype `.m-hud`/`.m-bracket`/`.m-scale`, reading
  the selected sat from the store; MODE = `trackingId ? "TRACK" : sel ? "SEL" : "WIDE"`.
- [ ] **Step 4:** `MobileApp.tsx` — full-screen `Scene` backdrop + `MobileHud` + top strip + clock
  line + floating SIM pill (opens timeline; wired in Task 8) + bottom tab bar (GLOBE/CATALOG/PASSES/
  AGENT, local `tab` state, filter-count badge from `filters`). Call `useSimClock()`. Panels render
  as stubs (`null`/placeholder) for now.
- [ ] **Step 5:** `index.html` viewport → `width=device-width, initial-scale=1.0, viewport-fit=cover`.
- [ ] **Step 6:** `npm run typecheck` + `npm run build` → clean.
- [ ] **Step 7:** Manual: at ≤768px the globe renders full-screen with HUD + tabs; rotate/pinch/tap-
  select work; above 768px the desktop is unchanged.
- [ ] **Step 8:** Commit: `feat: mobile layout switch, shell, and globe backdrop`.

---

### Task 5: InfoSheet (globe tab)

**Files:** Create `src/mobile/InfoSheet.tsx`; render it from `MobileApp` when `tab==="globe" && sel`.

- [ ] **Step 1:** Port prototype `InfoSheet` + `GroundTrack` usage. Stat grid, KV mission list from
  `ucs`+`inferUsage`, actions: PIN→`togglePin`, TRACK→`setTrackingId(t => t===id?null:id)`,
  INFO→expand the sheet, TLE→reveal `tleLine1`/`tleLine2`. "QUERY THIS SATELLITE →" sets `tab`
  to `"agent"` (via a callback prop from `MobileApp`).
- [ ] **Step 2:** Render the ground track from `groundTrackPoints(sel, simTime ?? Date.now())` in a
  small equirectangular SVG (reuse the prototype's `GroundTrack` SVG frame, feed real points).
- [ ] **Step 3:** `npm run typecheck` → clean.
- [ ] **Step 4:** Manual: select a sat → sheet shows real stats; PIN/TRACK reflect in store/globe;
  TLE shows real lines; ground track draws.
- [ ] **Step 5:** Commit: `feat: mobile InfoSheet with real ground track`.

---

### Task 6: CatalogPanel

**Files:** Create `src/mobile/CatalogPanel.tsx`; render when `tab==="catalog"`.

- [ ] **Step 1:** Port prototype `CatalogPanel`. ORBIT pills → `toggleFilter("orbitClasses", o)`,
  USAGE → `toggleFilter("users", u)`, TYPE → `toggleFilter("objectTypes", t)`; CLEAR →
  `clearAllFilters`. List from `visibleIds` (cap ~80 rows + "+N more"). Row tap → `setSelectedId` +
  set `tab` to `"globe"`. Badge/active count from the three filter sets.
- [ ] **Step 2:** `npm run typecheck` → clean.
- [ ] **Step 3:** Manual: filters change the list, the globe visibility, and the tab badge; tap
  returns to globe with the sat selected.
- [ ] **Step 4:** Commit: `feat: mobile CatalogPanel`.

---

### Task 7: PassesPanel

**Files:** Create `src/mobile/PassesPanel.tsx`; render when `tab==="passes"`.

- [ ] **Step 1:** Port prototype `PassesPanel`. Observer editor bound to `store.observer`
  (`latDeg`/`lonDeg`/`altKm`). Passes: `predictPasses(sel, observer, new Date(simTime??Date.now()))`
  when selected, else `predictNextPasses(fleetSubset, observer, from)` — reuse the same sat-limiting
  the desktop `UpcomingPasses` uses (read it and mirror the cap). `compassDir` for azimuths. Memoize
  on `[sel?.noradId, observer, simBucket]` where `simBucket` is the sim time rounded to the minute.
- [ ] **Step 2:** `npm run typecheck` → clean.
- [ ] **Step 3:** Manual: passes list renders; editing the observer recomputes it.
- [ ] **Step 4:** Commit: `feat: mobile PassesPanel with real SGP4 passes`.

---

### Task 8: AgentPanel + TimelineSheet + SIM pill

**Files:** Create `src/mobile/AgentPanel.tsx`, `src/mobile/TimelineSheet.tsx`; wire the SIM pill in
`MobileApp`.

- [ ] **Step 1:** `AgentPanel` — `useAgentConversation(sel)`; port the prototype `AgentPanel` markup
  (suggest pills, thread, input, STOP/SEND, RESET). Keep local `input`. Empty state when no `sel`.
- [ ] **Step 2:** `TimelineSheet` — bind to store `simTime`/`playing`/`playRate` and mirror desktop
  `Timeline`'s scrub math (±4h `WINDOW_MS`, `dropToSim`, `togglePlay`, `goLive`, speed set). Port
  the prototype's sheet markup + scrim.
- [ ] **Step 3:** SIM pill in `MobileApp` shows `LIVE`/offset + rate and opens `TimelineSheet`.
- [ ] **Step 4:** `npm run typecheck` → clean.
- [ ] **Step 5:** Manual: agent streams through the proxy; timeline scrub animates the globe; LIVE
  resets.
- [ ] **Step 6:** Commit: `feat: mobile AgentPanel and TimelineSheet`.

---

### Task 9: SearchOverlay + CompareTray + final QA

**Files:** Create `src/mobile/SearchOverlay.tsx`, `src/mobile/CompareTray.tsx`; wire into `MobileApp`.

- [ ] **Step 1:** `SearchOverlay` — full-screen; binds `searchQuery`; results from the dataset;
  pick → select + close + `tab` "globe". Opened by the top-strip search icon.
- [ ] **Step 2:** `CompareTray` — pins from `pinnedIds`; shown on globe tab when pins exist and the
  InfoSheet isn't expanded; card tap selects, × unpins.
- [ ] **Step 3:** `npm run typecheck` + `npm run build` → clean.
- [ ] **Step 4:** Manual QA pass in a ~402×874 viewport: every tab; select↔HUD↔InfoSheet;
  filter→catalog+globe+badge; observer→passes; timeline scrub; agent stream; search; pins; then
  resize across 768px both ways and confirm selection/filter/pin/sim state carries over.
- [ ] **Step 5:** Commit: `feat: mobile SearchOverlay and CompareTray`.

---

## Self-Review

**Spec coverage:** entry/switch (T4), globe backdrop + HUD (T4), shell/nav (T4), InfoSheet (T5),
Catalog (T6), Passes (T7), Agent (T8), Timeline (T8), Search + CompareTray (T9), shared refactors
(T1), ground track (T2), styling (T3), viewport meta (T4). All spec sections mapped.

**Placeholder scan:** panel markup intentionally references the prototype source (documented in
Global Constraints) rather than re-transcribing ~400 lines; all non-obvious logic (hooks, ground
track, App branch, store wiring) is specified with exact signatures. No TBD/TODO.

**Type consistency:** `Turn`, hook return shapes, `groundTrackPoints`, `format.ts` helpers, and
store action names (`togglePin`, `setTrackingId`, `toggleFilter`, `clearAllFilters`, `setSelectedId`,
`setObserver`) match the store in `src/store.ts` and predictor `Observer` fields.
