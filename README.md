# Overwatch Control

Command workstation application for the Overwatch autonomous perching drone mesh system. Built with Electron, React, and TypeScript.

Overwatch Control runs on a ruggedised workstation inside a command vehicle and provides real-time situational awareness, venue management, and swarm oversight for protective security operations.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Shell | Electron 35, Electron Forge 7 |
| Renderer | React 19, Vite 7, TypeScript 5.9 |
| Styling | Tailwind CSS 4 |
| State | Zustand 5 |
| Maps | MapLibre GL JS 5 |
| Local DB | better-sqlite3 (WAL), sqlite-vec |
| Comms | WebSocket (ws) |

## Getting Started

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Package for distribution
npm run package

# Build distributable installers
npm run make
```

The app starts in **Simulation Mode** by default — a tick-based engine drives 10 virtual drones (6× Tier 1 indoor, 4× Tier 2 outdoor) across a procedurally generated venue so you can develop the UI without hardware.

Toggle to **Live Mode** via the sidebar to connect to real drones through the Electron IPC bridge.

## Project Structure

```
overwatch-control/
├── electron/                   # Electron main process
│   ├── main.ts                 # Window creation, app lifecycle
│   ├── preload.ts              # contextBridge API for renderer
│   ├── ipc/                    # IPC handler registration
│   │   ├── handlers.ts         # Hub — world model + delegates
│   │   ├── venue-handlers.ts   # Venue/zone/perch-point CRUD
│   │   └── asset-handlers.ts   # Kit/drone CRUD, onboarding
│   ├── services/
│   │   ├── venue-manager.ts    # Venue CRUD, floor plan stub
│   │   └── asset-manager.ts    # Kit/drone CRUD, mock onboarding
│   └── storage/
│       ├── overwatch-db.ts     # SQLite wrapper (WAL + sqlite-vec)
│       └── migrations.ts       # Versioned SQL migrations
├── src/                        # React renderer
│   ├── main.tsx                # Root with mode selection
│   ├── App.tsx                 # View routing + sidebar nav
│   ├── index.css               # Tailwind v4 theme (Overwatch palette)
│   ├── views/
│   │   └── TacticalView.tsx    # Main operational view
│   ├── panels/
│   │   └── SwarmPanel.tsx      # Drone status cards by tier
│   ├── components/
│   │   ├── map/
│   │   │   ├── VenueMap.tsx    # MapLibre venue map
│   │   │   ├── DroneMarker.tsx # Tier-aware drone icon
│   │   │   └── ZoneOverlay.tsx # Zone polygon styling
│   │   └── common/
│   │       ├── TierBadge.tsx   # T1 / T2 label
│   │       └── PerchStateIcon.tsx
│   ├── data/
│   │   ├── ipc-provider.ts     # Live data via Electron IPC
│   │   ├── simulation-provider.ts
│   │   └── simulation/
│   │       ├── engine.ts       # Tick-based simulation engine
│   │       ├── drone-sim.ts    # Virtual drones (perch states)
│   │       ├── venue-sim.ts    # Procedural venue generator
│   │       └── principal-sim.ts
│   ├── shared/
│   │   ├── store/
│   │   │   └── overwatch-store.ts  # Zustand store
│   │   └── types/              # TypeScript type definitions
│   └── protocol/
│       └── messages.ts         # OW message types
├── assets/                     # Launcher icons
├── forge.config.ts
├── vite.main.config.ts
├── vite.renderer.config.ts
├── vite.preload.config.ts
├── tsconfig.json
└── package.json
```

## Local Database

SQLite database stored at `{userData}/overwatch.sqlite` with WAL mode and foreign keys enabled. The `sqlite-vec` extension provides cosine-similarity vector search for the world model.

**Schema (v1):** kits, drone_profiles, venues, venue_zones, zone_connections, perch_points, surface_assessments, operations, principals, protection_agents, alerts, weather_observations, wm_nodes, wm_edges, override_episodes, settings.

Migrations are versioned and applied automatically on startup.

## Simulation Engine

The simulation runs at 500ms ticks and models:

- **Drones** — Full state machine: sleeping → launching → transit → perching → perched → repositioning → returning. Tier-aware zone eligibility (T1 indoor only, T2 outdoor capable). Battery drain varies by state.
- **Venue** — 10 zones (lobby, corridors, rooms, entrance, parking, perimeter, rooftop) with connectivity graph and 21 candidate perch points across varied surface types.
- **Principal** — Zone-by-zone movement with configurable patterns and simulated BLE positioning.

## Related Projects

- **[overwatch-cloud](https://github.com/nganga-moses/overwatch-cloud)** — FastAPI cloud backend for sync, multi-tenancy, and blob storage
- **FireflyOS** — Cognitive drone operating system deployed on Overwatch drones
