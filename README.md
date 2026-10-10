# Computer-Craft-TypeScript

A web dashboard for a fleet of [ComputerCraft: Tweaked](https://tweaked.cc/) turtles. You can see which turtles are
online and where they are, and later you'll be able to send them commands.

This repo is **only the frontend**. All of its data comes from the Kotlin control server
in [Computer-Craft-Kotlin](../../Documents/Programming/Java%20Projects/Computer-Craft-Kotlin). The browser never talks
to turtles directly.

```
 Turtles (Lua)  ──WebSocket /ws/turtle──▶  Kotlin server  ◀──REST /api/*──  Dashboard (this repo)
                                          (Ktor :8000)    ◀──WebSocket /ws/dashboard──
```

> **Status:** early. The turtle list, fleet map and detail panel work against `GET /api/turtles`. The `/ws/dashboard`
> client is built, but the server doesn't expose that endpoint yet. Until it does, the dashboard polls REST every 5s and
> the header badge shows **polling**. It switches to **live** automatically once the socket is up.

---

## Stack

| Concern            | Choice                                                                                                 |
|--------------------|--------------------------------------------------------------------------------------------------------|
| Language           | TypeScript (strict)                                                                                    |
| Build / dev server | [Vite](https://vitejs.dev/)                                                                            |
| UI                 | React                                                                                                  |
| Data fetching      | `fetch` + [TanStack Query](https://tanstack.com/query) for REST; a native `WebSocket` for live updates |
| Validation         | [zod](https://zod.dev/) schemas that mirror the Kotlin `protocol` messages                             |
| Map view           | SVG top-down grid (X/Z, north up), coloured by turtle, one dimension at a time                         |

---

## Getting started

Install dependencies (Node 20+). Vite is pinned to v6 because Vite 7 needs Node 20.19+:

```bash
npm install
```

Run the Kotlin server (`./gradlew run` in Computer-Craft-Kotlin), then:

```bash
npm run dev
```

### Talking to the backend in development

The Vite dev server proxies API and WebSocket traffic to the Kotlin server. That keeps the frontend on the same origin
as the API, so no CORS setup is needed while developing:

```ts
// vite.config.ts
import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            "/api": "http://localhost:8000",
            "/ws": {target: "ws://localhost:8000", ws: true},
        },
    },
});
```

In the app code, always use relative URLs (`/api/turtles`, `/ws/dashboard`).

### Production / remote server

Set the backend's base URL in `.env.production`:

```
VITE_API_URL=https://<your-server>
```

The Kotlin server then needs CORS enabled for the dashboard's origin. If the server is behind a free **ngrok** domain,
browser requests get ngrok's warning page unless they send the `ngrok-skip-browser-warning` header. Add that header to
`fetch` calls in that setup.

---

## Backend contract

The backend owns this contract, and both repos must agree on it. Every message is JSON with a `type` field and a
protocol version `v`. Mirror the Kotlin `protocol.messages` classes here as zod schemas in `src/api/schemas.ts`.

### REST

| Method | Path                                   | Response                                                                                                   |
|--------|----------------------------------------|------------------------------------------------------------------------------------------------------------|
| `GET`  | `/api/turtles`                         | `TurtleStatus[]`                                                                                           |
| `GET`  | `/api/turtles/{id}`                    | `TurtleStatus`                                                                                             |
| `POST` | `/api/turtles/{id}/seed`               | `202` + `PositionSeed`. Body: `{ x, y, z, heading: "N"\|"E"\|"S"\|"W", world?, dimension?, source? }`      |
| `PUT`  | `/api/turtles/{id}/label`              | `202` + `TurtleStatus`. Body: `{ label: string \| null }` (null/blank clears; ≤32 printable ASCII chars)   |
| `GET`  | `/api/turtles/{id}/inventory`          | `TurtleInventory`, or `404` if the turtle has never reported one                                           |
| `POST` | `/api/turtles/{id}/inventory/selected` | `202` + `{ slot }`. Body: `{ slot: 1-16 }`. Not queued: `409` if the turtle is offline                     |
| `POST` | `/api/turtles/{id}/refuel`             | `202` + `RefuelCommand`. Body: `{ count: 1-64 \| null }` (null burns the selected stack). `409` if offline |
| `POST` | `/api/turtles/{id}/commands`           | *(later)* queue a command for a turtle                                                                     |

```ts
type TurtleStatus = {
  turtleId: number;
  label: string | null;
  online: boolean;
  lastSeen: number | null;        // unix seconds, null if never seen
  position: {
    x: number; y: number; z: number;
    heading: string | null;       // "N" | "E" | "S" | "W" in practice; not enforced by the server
    world: string | null;
    dimension: string | null;
    ts: number;
  } | null;
  pendingSeed: PositionSeed | null; // seeded but not yet applied by the turtle
    pendingLabel: PendingLabel | null; // renamed but not yet applied by the turtle
};

// The server hands a rename to the turtle on its next heartbeat; the turtle calls os.setComputerLabel and
// registers again, and a registration carrying the same label clears it.
type PendingLabel = {
    label: string | null;           // null clears the label
    ts: number;
};

// The turtle reports its whole inventory on connect, whenever it changes, and after selecting a slot or refuelling.
// /ws/dashboard has no inventory event, so the dashboard polls the selected turtle's inventory every 2s.
type TurtleInventory = {
    selectedSlot: number;           // 1..16
    slots: { slot: number; name: string; count: number; nbt: string | null }[]; // empty slots are left out
    fuel: { level: number | null; limit: number | null } | null; // null = not reported; level/limit null = unlimited
    lastRefuel: RefuelResult | null; // the turtle's latest refuel since the server started
    ts: number;
};

// POST /refuel returns { refuelId, count, ts }; the turtle's answer shows up as lastRefuel with the same refuelId.
type RefuelResult = {
    refuelId: number;
    refueled: boolean;
    error: string | null;           // turtle.refuel's reason, e.g. "Items not combustible"
    fuelAdded: number | null;       // null when fuel is unlimited
    ts: number;
};

// Turtles have no GPS: they dead-reckon from a seed set on the dashboard. The server hands the seed
// to the turtle on its next heartbeat and clears it when a position report carries the same seedId.
type PositionSeed = {
  seedId: number;
  x: number; y: number; z: number;
  heading: string;
  world: string | null;
  dimension: string | null;
  source: string;                 // "dashboard" or "commander:<id>"
  ts: number;
};
```

### WebSocket `/ws/dashboard` (server → browser)

When the socket connects, the server sends a `snapshot`, followed by incremental events:

```ts
type DashboardEvent =
  | { v: 1; type: "snapshot"; turtles: TurtleStatus[] }
  | { v: 1; type: "turtle_connected"; turtleId: number; label: string | null }
  | { v: 1; type: "turtle_disconnected"; turtleId: number }
  | { v: 1; type: "position_update"; turtleId: number; x: number; y: number; z: number;
      heading: string | null; world: string | null; dimension: string | null;
      seedId: number | null; ts: number };   // seedId acknowledges (clears) a pendingSeed
```

The client should reconnect with backoff, and treat each new `snapshot` as the source of truth.

---

## Structure

```
src/
├── api/
│   ├── client.ts        # fetch wrapper (base URL, error handling)
│   ├── schemas.ts       # zod schemas mirroring Kotlin protocol messages
│   └── socket.ts        # /ws/dashboard connection + reconnect logic
├── hooks/
│   ├── useTurtles.ts    # REST query + live socket updates merged into one store
│   ├── useInventory.ts  # polls a turtle's inventory, selects slots
│   └── useDashboardSocket.ts
├── components/
│   ├── TurtleList.tsx   # online/offline, label, last seen
│   ├── TurtleDetail.tsx # position, heading, (later) fuel/inventory/commands
│   ├── InventoryPanel.tsx # 4×4 inventory grid; click a slot to select it
│   ├── RefuelForm.tsx   # fuel gauge, refuel N items / the whole selected stack
│   ├── LabelForm.tsx    # rename a turtle (PUT /label)
│   ├── SeedForm.tsx     # set a turtle's position + heading (POST /seed)
│   └── FleetMap.tsx     # top-down X/Z map
├── lib/
│   └── format.ts        # colours, names, "x ago" timestamps
├── App.tsx
└── main.tsx
```

---

## Roadmap

- [x] Scaffold Vite + React + TS, set up the dev proxy
- [x] `schemas.ts` mirroring `PositionUpdate` / `TurtleStatus` / `TurtlePosition`
- [x] Turtle list from `GET /api/turtles`
- [ ] Live updates from `/ws/dashboard` (client done; waiting on the server endpoint)
- [x] Top-down fleet map
- [x] Turtle detail panel
- [x] Seed a turtle's position and heading from the detail panel
- [x] Rename a turtle from the detail panel
- [x] Show a turtle's inventory and select its slot
- [x] Show a turtle's fuel and refuel it from the selected slot
- [ ] Sending commands (move, mine, return home) once the backend supports them
- [ ] Production build + deployment (served by Ktor as static files, or hosted separately with CORS)
