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

> **Status:** early. The turtle list, fleet map, detail panel, inventory and commands work against `GET /api/turtles`.
> The `/ws/dashboard`
> client is built, but the server doesn't expose that endpoint yet. Until it does, the dashboard polls REST every 5s and
> switches to live updates automatically once the socket is up. The header pill shows **Running** (green) while the
> server is reachable either way, and **Offline** (grey) when it isn't.

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

| Method   | Path                                   | Response                                                                                                                |
|----------|----------------------------------------|-------------------------------------------------------------------------------------------------------------------------|
| `GET`    | `/api/turtles`                         | `TurtleStatus[]`                                                                                                        |
| `GET`    | `/api/turtles/{id}`                    | `TurtleStatus`                                                                                                          |
| `POST`   | `/api/turtles/{id}/seed`               | `202` + `PositionSeed`. Body: `{ x, y, z, heading: "N"\|"E"\|"S"\|"W", world?, dimension?, source? }`                   |
| `PUT`    | `/api/turtles/{id}/label`              | `202` + `TurtleStatus`. Body: `{ label: string \| null }` (null/blank clears; ≤32 printable ASCII chars)                |
| `PUT`    | `/api/turtles/{id}/equipment`          | `TurtleStatus`. Body: `{ left, right }` (`EquippedUpgrade \| null`). `404` if unknown                                   |
| `GET`    | `/api/turtles/{id}/inventory`          | `TurtleInventory`, or `404` if the turtle has never reported one                                                        |
| `POST`   | `/api/turtles/{id}/inventory/selected` | `202` + `{ slot }`. Body: `{ slot: 1-16 }`. Not queued: `409` if the turtle is offline                                  |
| `POST`   | `/api/turtles/{id}/refuel`             | `202` + `RefuelCommand`. Body: `{ count: 1-64 \| null }` (null burns the selected stack). `409` if offline              |
| `POST`   | `/api/turtles/{id}/commands`           | `202` + `TurtleCommand`. Body: `{ command }` (one of `COMMANDS`). `400` if unknown, `409` if offline                    |
| `POST`   | `/api/turtles/{id}/goto`               | `202` + `Trip`. Body: `{ x, y, z, heading: "N"\|"E"\|"S"\|"W" \| null }`. `409` offline/unseeded, `422` no path or fuel |
| `GET`    | `/api/turtles/{id}/goto`               | `Trip`: the current trip, or the last one since the server started. `404` if none                                       |
| `DELETE` | `/api/turtles/{id}/goto`               | `202` + `Trip`. Stops the turtle after its current step. `404` if no trip is in progress                                |
| `GET`    | `/api/stations`                        | `Station[]`. Optional query `type`                                                                                      |
| `POST`   | `/api/stations`                        | `201` + `Station`. Body: `StationRequest`. `400` if invalid, `409` if it overlaps another station                       |
| `DELETE` | `/api/stations/{id}`                   | `204`. `404` if unknown                                                                                                 |
| `GET`    | `/api/map/blocks`                      | `MapRegion`. Query: `minX..maxZ` (inclusive, ≤256 apart per axis), optional `world`, `dimension`, `excludeAir`          |

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
    equipment: TurtleEquipment | null; // null until the turtle reports it
    lastCommand: CommandResult | null; // the turtle's latest command since the server started
};

// POST /commands returns { commandId, command, ts }; the turtle's answer shows up as the status's lastCommand with
// the same commandId. While waiting, the dashboard polls GET /api/turtles/{id} every 0.5s and gives up after 10s.
// Commands: forward, back, up, down, turnLeft, turnRight, and dig / place / drop / suck / attack (+Up, +Down).
// A command sent while the turtle is still running the previous one is lost, so the dashboard sends one at a time.
type CommandResult = {
    commandId: number;
    command: string;
    success: boolean;
    error: string | null;           // the turtle API's reason, e.g. "Movement obstructed"
    ts: number;
};

// The turtle reports its upgrades after connecting and whenever they change. The server works out `capabilities`
// from them: "dig", "attack", "craft", "modem", "speaker", or an unknown peripheral's type (e.g. "geoScanner").
// Every turtle can move, place, drop, suck and refuel, so those aren't listed.
// Older CC: Tweaked can't see tools, so the dashboard can seed the equipment (PUT /equipment). A seed is kept until
// the turtle reports with itemsKnown: true; seeding both sides as empty sets it back to bare.
type TurtleEquipment = {
    left: EquippedUpgrade | null;   // null = nothing equipped (or, when itemsKnown is false, maybe a tool)
    right: EquippedUpgrade | null;
    itemsKnown: boolean;            // false on CC: Tweaked versions without turtle.getEquippedLeft/Right
    capabilities: string[];
    seeded: boolean;                // set from the dashboard rather than reported
    ts: number;
};

type EquippedUpgrade = {
    item: string | null;            // e.g. "minecraft:diamond_pickaxe"; null if unknown
    peripheralTypes: string[];      // e.g. ["modem"]; empty for tools
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

// The blocks turtles have seen (they inspect in front, above and below after connecting, being seeded and every
// command). Empty cells are "minecraft:air"; cells nobody has seen are left out. The 3D map asks for excludeAir=true
// and a box of whole 16-block chunks around the selected turtle (or the middle of the fleet): 1, 2, 4 or 7 chunks each
// way, picked in the map header. It polls every 5s, and refetches as soon as a dashboard command's result arrives.
type MapRegion = {
    world: string | null;
    dimension: string | null;
    blocks: { x: number; y: number; z: number; name: string; turtleId: number | null; ts: number }[];
};

// Places turtles go to refuel, drop items off or pick them up, shared by the whole fleet. x, y, z is the cell the
// turtle stands in; the chest is above, below or in front of it (front needs a heading). Names: 1-32 printable ASCII.
type StationRequest = {
    name: string;
    type: "fuel" | "drop" | "pickup";
    x: number; y: number; z: number;
    heading: string | null;         // which way the turtle faces there
    side: "up" | "down" | "front";
    world: string | null;
    dimension: string | null;
};
type Station = StationRequest & { stationId: number; ts: number };

// POST /goto plans a path straight away and refuses an impossible one. When the turtle runs into something the server
// plans again from where it stopped. The dashboard polls GET /goto (and the turtle) every 1s while a trip is moving,
// and holds back single commands until it ends.
type Trip = {
    tripId: number;
    x: number; y: number; z: number;
    heading: string | null;
    status: "moving" | "arrived" | "failed" | "cancelled";
    pathId: number;
    steps: number;                  // steps in the current path
    fuel: number;                   // fuel the current path needs
    replans: number;
    error: string | null;           // why it failed
    started: number;
    updated: number;
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
│   ├── useTurtles.ts    # REST query + live socket updates merged into one store; seed, rename, send commands
│   ├── useInventory.ts  # polls a turtle's inventory, selects slots
│   ├── useWorldMap.ts   # polls the world map around the turtles for the 3D map
│   ├── useStations.ts   # the fleet's stations; add and remove them
│   ├── useTrip.ts       # a turtle's goto trip: start, poll while moving, stop
│   └── useDashboardSocket.ts
├── components/
│   ├── WorldList.tsx    # the worlds turtles are in; choosing one limits the list and map to it
│   ├── TurtleList.tsx   # turtles in the chosen world by dimension: online/offline, label, last seen
│   ├── StationsPanel.tsx # collapsible list of the chosen world's stations by dimension, with Add and remove
│   ├── StationForm.tsx  # name, type, standing cell (or the selected turtle's), chest side, heading, world
│   ├── TurtleDetail.tsx # status, label, position, equipment, commands
│   ├── LabelPositionSection.tsx # label + reported position, with an Edit button that opens LabelPositionForm
│   ├── EquipmentSection.tsx # equipped upgrades, with a Seed button that opens EquipmentForm
│   ├── EquipmentForm.tsx # pick each side's upgrade from a list or type an item id (PUT /equipment)
│   ├── CommandPad.tsx   # move/turn pad, and dig/place/drop/suck/attack tiles aimed by an Up/Front/Down switch
│   ├── GotoForm.tsx     # send the turtle to coordinates or a station, see the trip's progress, stop it
│   ├── PlaceSelect.tsx  # world / dimension dropdown with None and "Add new…"
│   ├── Segmented.tsx    # radios styled as segmented buttons
│   ├── InventoryPanel.tsx # 4×4 inventory grid; click a slot to select it
│   ├── RefuelForm.tsx   # fuel gauge, refuel N items / the whole selected stack
│   ├── LabelPositionForm.tsx # rename (PUT /label) and set position + heading (POST /seed) in one form
│   ├── FleetMap.tsx     # top-down X/Z map of turtles and stations, and the switch to the 3D map
│   └── FleetMap3D.tsx   # three.js map of the turtles, stations and the blocks they've seen
├── lib/
│   ├── fleet.ts         # a turtle's world and dimension, grouping turtles by them
│   ├── format.ts        # colours, names, "x ago" timestamps
│   ├── stations.ts      # station names, colours, chest cells, filtering by world and grouping by dimension
│   └── world.ts         # block colours and which blocks the 3D map draws
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
- [x] 3D fleet map with the blocks turtles have seen
- [x] Turtle detail panel
- [x] Seed a turtle's position and heading from the detail panel
- [x] Rename a turtle from the detail panel
- [x] Show a turtle's inventory and select its slot
- [x] Show a turtle's fuel and refuel it from the selected slot
- [x] Show a turtle's equipment and which commands it can run
- [x] Send single commands (move, turn, dig, place, drop, suck, attack), gated by the turtle's capabilities
- [x] Add and view stations (fuel, drop-off, pickup), and show them on both maps
- [x] Send a turtle to a location or a station
- [ ] Higher-level commands (mine an area, return home)
- [ ] Production build + deployment (served by Ktor as static files, or hosted separately with CORS)
