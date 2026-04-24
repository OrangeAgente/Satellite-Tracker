# Satellite Tracker

Interactive 3D globe that renders every tracked space object (~25,000+) at its real current
position, animated in real time. Search by name or NORAD id, click a satellite to see its
full orbit and human-readable metadata, and filter by purpose, operator country, orbit class,
object type, or CelesTrak category.

## Data sources

- **CelesTrak GP** (`celestrak.org`) — current TLE/OMM orbital elements, per-category groupings.
- **CelesTrak SATCAT** — universal catalog: object type (payload / rocket body / debris), country, launch/decay.
- **UCS Satellite Database** — human metadata: users, purpose, operator, mass, power, launch site, contractor.

These are joined on NORAD catalog number at build time; the resulting static JSON is
shipped with the app and periodically topped up at runtime via CelesTrak's JSON/TLE endpoints.

## Run it (Docker)

The app runs entirely through Docker — no host-side Node install needed.

```bash
# Dev mode (hot reload, live TLE refresh every 2 min)
docker compose up --build
# → open http://localhost:5173
```

First boot runs `npm run build:data` inside the container, which fetches CelesTrak + UCS and
writes `public/data/satellites.json`. Expect this to take 30–60 seconds on a warm network.

### Refreshing data manually

```bash
docker compose run --rm app npm run build:data
```

### Production-style preview

```bash
docker compose --profile prod up --build prod
# → http://localhost:8080
```

## Tech stack

- Vite + React + TypeScript
- three.js via @react-three/fiber / drei
- satellite.js (SGP4/SDP4) running in a Web Worker
- zustand for state

## Keyboard / interactions

- **Drag** to rotate the globe. **Scroll** to zoom.
- **Click** a satellite point to select it (shows its full orbit + info panel).
- **Search** the name or NORAD id in the top-left box.
- **Filters** — multi-select; active filters intersect (users ∩ country ∩ orbit class ∩ …).

## Color key

- Cyan = LEO · Green = MEO · Amber = GEO · Magenta = HEO. Debris/rocket-body points are dimmed.

## Layout

```
scripts/build-dataset.mjs   # merges CelesTrak + UCS into public/data/satellites.json
src/propagation/            # Web Worker running SGP4 propagation at 2 Hz
src/globe/                  # three.js scene: Earth, point cloud, orbit line
src/ui/                     # search, filters, info panel, legend
docker/                     # entrypoint + nginx config
```
