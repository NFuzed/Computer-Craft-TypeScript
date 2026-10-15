import {z} from "zod";

// Mirrors the Kotlin `protocol` module (Computer-Craft-Kotlin/computercraft-fleet/protocol).
// Kotlin serialises with ignoreUnknownKeys + encodeDefaults, so nullable fields are always present,
// but we still accept them being omitted to stay tolerant of older servers.

export const PROTOCOL_VERSION = 1;

/** protocol.api.TurtlePosition */
export const TurtlePositionSchema = z.object({
    x: z.number().int(),
    y: z.number().int(),
    z: z.number().int(),
    // Kotlin types this as String? — usually "N" | "E" | "S" | "W", but not enforced server-side.
    heading: z.string().nullish().transform((h) => h ?? null),
    world: z.string().nullish().transform((w) => w ?? null),
    dimension: z.string().nullish().transform((d) => d ?? null),
    ts: z.number(), // unix seconds
});
export type TurtlePosition = z.infer<typeof TurtlePositionSchema>;

/** Valid turtle headings (protocol.api.HEADINGS). N = -z, E = +x, S = +z, W = -x. */
export const HEADINGS = ["N", "E", "S", "W"] as const;
export type Heading = (typeof HEADINGS)[number];

/** protocol.api.PositionSeed: a seed the server is waiting to hand to a turtle on its next heartbeat. */
export const PositionSeedSchema = z.object({
    seedId: z.number().int(),
    x: z.number().int(),
    y: z.number().int(),
    z: z.number().int(),
    heading: z.string(),
    world: z.string().nullish().transform((w) => w ?? null),
    dimension: z.string().nullish().transform((d) => d ?? null),
    source: z.string(), // "dashboard" or "commander:<id>"
    ts: z.number(), // unix seconds
});
export type PositionSeed = z.infer<typeof PositionSeedSchema>;

/** protocol.api.SeedRequest: body of POST /api/turtles/{id}/seed. */
export interface SeedRequest {
    x: number;
    y: number;
    z: number;
    heading: Heading;
    world?: string | null;
    dimension?: string | null;
    source?: string;
}

/** protocol.api.MAX_LABEL_LENGTH: ComputerCraft truncates computer labels to this many characters. */
export const MAX_LABEL_LENGTH = 32;

/** protocol.api.PendingLabel: a rename the server is waiting to hand to a turtle on its next heartbeat. */
export const PendingLabelSchema = z.object({
    label: z.string().nullish().transform((l) => l ?? null), // null clears the label
    ts: z.number(), // unix seconds
});
export type PendingLabel = z.infer<typeof PendingLabelSchema>;

/** protocol.api.LabelRequest: body of PUT /api/turtles/{id}/label. A null or blank label clears it. */
export interface LabelRequest {
    label: string | null;
}

/** protocol.api.INVENTORY_SIZE: turtle inventory slots are numbered 1 to 16, in a 4 × 4 grid. */
export const INVENTORY_SIZE = 16;

/** protocol.api.InventorySlot: one non-empty slot, as reported by turtle.getItemDetail. */
export const InventorySlotSchema = z.object({
    slot: z.number().int(), // 1..16
    name: z.string(), // item id, e.g. "minecraft:cobblestone"
    count: z.number().int(),
    nbt: z.string().nullish().transform((n) => n ?? null), // hash of the item's NBT, if it has any
});
export type InventorySlot = z.infer<typeof InventorySlotSchema>;

/** protocol.api.TurtleFuel: turtle.getFuelLevel / getFuelLimit. Both null when the server has unlimited fuel. */
export const TurtleFuelSchema = z.object({
    level: z.number().int().nullish().transform((l) => l ?? null),
    limit: z.number().int().nullish().transform((l) => l ?? null),
});
export type TurtleFuel = z.infer<typeof TurtleFuelSchema>;

/** protocol.api.MAX_REFUEL_COUNT: most items one refuel can burn (a full stack). */
export const MAX_REFUEL_COUNT = 64;

/** protocol.api.RefuelRequest: body of POST /api/turtles/{id}/refuel. A null count burns the whole selected stack. */
export interface RefuelRequest {
    count: number | null;
}

/** protocol.api.RefuelCommand: returned with 202 once the refuel has been sent to the turtle. */
export const RefuelCommandSchema = z.object({
    refuelId: z.number().int(),
    count: z.number().int().nullish().transform((c) => c ?? null),
    ts: z.number(),
});
export type RefuelCommand = z.infer<typeof RefuelCommandSchema>;

/** protocol.api.RefuelResult: what happened when the turtle ran a refuel. */
export const RefuelResultSchema = z.object({
    refuelId: z.number().int(),
    refueled: z.boolean(),
    error: z.string().nullish().transform((e) => e ?? null), // e.g. "Items not combustible"
    fuelAdded: z.number().int().nullish().transform((f) => f ?? null), // null when fuel is unlimited
    ts: z.number(),
});
export type RefuelResult = z.infer<typeof RefuelResultSchema>;

/** protocol.api.TurtleInventory: the last inventory a turtle reported. Empty slots are left out of `slots`. */
export const TurtleInventorySchema = z.object({
    selectedSlot: z.number().int(),
    slots: z.array(InventorySlotSchema),
    fuel: TurtleFuelSchema.nullish().transform((f) => f ?? null), // null if the turtle's code predates fuel reporting
    lastRefuel: RefuelResultSchema.nullish().transform((r) => r ?? null), // latest refuel since the server started
    ts: z.number(), // unix seconds
});
export type TurtleInventory = z.infer<typeof TurtleInventorySchema>;

/** protocol.api.SelectSlotRequest: body of POST /api/turtles/{id}/inventory/selected. */
export const SelectSlotRequestSchema = z.object({
    slot: z.number().int(), // 1..16
});
export type SelectSlotRequest = z.infer<typeof SelectSlotRequestSchema>;

/**
 * protocol.api.Capabilities: values in TurtleEquipment.capabilities. A peripheral the server has no name for shows up
 * as its peripheral type instead (e.g. "geoScanner"), so capabilities aren't limited to these.
 */
export const Capabilities = {
    DIG: "dig", // a pickaxe, shovel, axe or hoe
    ATTACK: "attack", // any tool
    CRAFT: "craft", // crafting table upgrade (peripheral type "workbench")
    MODEM: "modem", // wireless or ender modem
    SPEAKER: "speaker",
} as const;

/** protocol.api.EquippedUpgrade: what a turtle has equipped on one side. */
export const EquippedUpgradeSchema = z.object({
    item: z.string().nullish().transform((i) => i ?? null), // e.g. "minecraft:diamond_pickaxe"; null if unknown
    peripheralTypes: z.array(z.string()).nullish().transform((t) => t ?? []), // e.g. ["modem"]; empty for tools
});
export type EquippedUpgrade = z.infer<typeof EquippedUpgradeSchema>;

/**
 * protocol.api.TurtleEquipment: the upgrades a turtle last reported and the capabilities the server worked out from
 * them. A null side has nothing equipped, but when `itemsKnown` is false (older CC: Tweaked) it may still hold a tool.
 * `seeded` is true when the dashboard set it instead (see EquipmentSeedRequest).
 */
export const TurtleEquipmentSchema = z.object({
    left: EquippedUpgradeSchema.nullish().transform((u) => u ?? null),
    right: EquippedUpgradeSchema.nullish().transform((u) => u ?? null),
    itemsKnown: z.boolean(),
    capabilities: z.array(z.string()),
    seeded: z.boolean().nullish().transform((s) => s ?? false), // false on servers that can't seed equipment
    ts: z.number(), // unix seconds
});
export type TurtleEquipment = z.infer<typeof TurtleEquipmentSchema>;

/**
 * protocol.api.EquipmentSeedRequest: body of PUT /api/turtles/{id}/equipment, saying what a turtle has equipped when it
 * can't read that itself. A null side is empty. It stays until the turtle reports equipment with item names.
 */
export interface EquipmentSeedRequest {
    left: EquippedUpgrade | null;
    right: EquippedUpgrade | null;
}

/**
 * protocol.api.Commands: what POST /api/turtles/{id}/commands can make a turtle do, one turtle API call each. Moves and
 * turns need a seeded turtle; dig and attack need the matching capability.
 */
export const COMMANDS = [
    "forward", "back", "up", "down", "turnLeft", "turnRight",
    "dig", "digUp", "digDown", "place", "placeUp", "placeDown",
    "drop", "dropUp", "dropDown", "suck", "suckUp", "suckDown",
    "attack", "attackUp", "attackDown",
] as const;
export type Command = (typeof COMMANDS)[number];

/** protocol.api.CommandRequest: body of POST /api/turtles/{id}/commands. */
export interface CommandRequest {
    command: Command;
}

/** protocol.api.TurtleCommand: returned with 202 once the command has been sent to the turtle. */
export const TurtleCommandSchema = z.object({
    commandId: z.number().int(),
    command: z.string(),
    ts: z.number(),
});
export type TurtleCommand = z.infer<typeof TurtleCommandSchema>;

/** protocol.api.CommandResult: what happened when the turtle ran a command. */
export const CommandResultSchema = z.object({
    commandId: z.number().int(),
    command: z.string(),
    success: z.boolean(),
    error: z.string().nullish().transform((e) => e ?? null), // e.g. "Movement obstructed"
    ts: z.number(),
});
export type CommandResult = z.infer<typeof CommandResultSchema>;

/** protocol.api.AIR: the block name turtles report for an empty cell, so known air differs from unseen cells. */
export const AIR = "minecraft:air";

/** protocol.api.MAX_MAP_QUERY_SPAN: largest span, in blocks, a /api/map/blocks query may cover along each axis. */
export const MAX_MAP_QUERY_SPAN = 256;

/** protocol.api.KnownBlock: one cell of the world map, as a turtle last saw it. */
export const KnownBlockSchema = z.object({
    x: z.number().int(),
    y: z.number().int(),
    z: z.number().int(),
    name: z.string(), // block id, e.g. "minecraft:stone", or AIR
    turtleId: z.number().int().nullish().transform((id) => id ?? null), // the turtle that saw it
    ts: z.number(), // unix seconds
});
export type KnownBlock = z.infer<typeof KnownBlockSchema>;

/** protocol.api.MapRegion: the known blocks in the box a /api/map/blocks query asked for. Unseen cells are left out. */
export const MapRegionSchema = z.object({
    world: z.string().nullish().transform((w) => w ?? null),
    dimension: z.string().nullish().transform((d) => d ?? null),
    blocks: z.array(KnownBlockSchema),
});
export type MapRegion = z.infer<typeof MapRegionSchema>;

/** Query of GET /api/map/blocks: an inclusive box, in the map for a world and dimension (each optional). */
export interface MapBox {
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
    world: string | null;
    dimension: string | null;
}

/** protocol.api.TurtleStatus */
export const TurtleStatusSchema = z.object({
    turtleId: z.number().int(),
    label: z.string().nullish().transform((l) => l ?? null),
    online: z.boolean(),
    lastSeen: z.number().nullish().transform((t) => t ?? null), // unix seconds, null if never seen
    position: TurtlePositionSchema.nullish().transform((p) => p ?? null),
    pendingSeed: PositionSeedSchema.nullish().transform((s) => s ?? null), // sent but not yet applied by the turtle
    pendingLabel: PendingLabelSchema.nullish().transform((l) => l ?? null), // rename not yet applied by the turtle
    equipment: TurtleEquipmentSchema.nullish().transform((e) => e ?? null), // null until the turtle reports it
    lastCommand: CommandResultSchema.nullish().transform((c) => c ?? null), // latest command since the server started
});
export type TurtleStatus = z.infer<typeof TurtleStatusSchema>;

export const TurtleStatusListSchema = z.array(TurtleStatusSchema);

/** protocol.api.ApiError */
export const ApiErrorSchema = z.object({error: z.string()});

// --- /ws/dashboard events (server → browser) ---

const versioned = {v: z.literal(PROTOCOL_VERSION)};

export const SnapshotEventSchema = z.object({
    ...versioned,
    type: z.literal("snapshot"),
    turtles: TurtleStatusListSchema,
});

export const TurtleConnectedEventSchema = z.object({
    ...versioned,
    type: z.literal("turtle_connected"),
    turtleId: z.number().int(),
    label: z.string().nullish().transform((l) => l ?? null),
});

export const TurtleDisconnectedEventSchema = z.object({
    ...versioned,
    type: z.literal("turtle_disconnected"),
    turtleId: z.number().int(),
});

/** protocol.messages.PositionUpdate */
export const PositionUpdateEventSchema = z.object({
    ...versioned,
    type: z.literal("position_update"),
    turtleId: z.number().int(),
    x: z.number().int(),
    y: z.number().int(),
    z: z.number().int(),
    heading: z.string().nullish().transform((h) => h ?? null),
    world: z.string().nullish().transform((w) => w ?? null),
    dimension: z.string().nullish().transform((d) => d ?? null),
    seedId: z.number().int().nullish().transform((id) => id ?? null), // acknowledges a pending seed
    ts: z.number(),
});

export const DashboardEventSchema = z.discriminatedUnion("type", [
    SnapshotEventSchema,
    TurtleConnectedEventSchema,
    TurtleDisconnectedEventSchema,
    PositionUpdateEventSchema,
]);
export type DashboardEvent = z.infer<typeof DashboardEventSchema>;

// --- Stations and trips ---

/** protocol.api.StationTypes: what turtles go to a station for. */
export const STATION_TYPES = ["fuel", "drop", "pickup"] as const;
export type StationType = (typeof STATION_TYPES)[number];

/** protocol.api.StationSides: where the chest is, seen from the cell the turtle stands in. Front needs a heading. */
export const STATION_SIDES = ["up", "down", "front"] as const;
export type StationSide = (typeof STATION_SIDES)[number];

/** protocol.api.MAX_STATION_NAME_LENGTH: same limit as turtle labels. */
export const MAX_STATION_NAME_LENGTH = 32;

/** protocol.api.Station: a place turtles go to refuel, drop items off or pick them up. Shared by the whole fleet. */
export const StationSchema = z.object({
    stationId: z.number().int(),
    name: z.string(),
    type: z.string(), // one of STATION_TYPES
    x: z.number().int(), // the cell the turtle stands in, not the chest
    y: z.number().int(),
    z: z.number().int(),
    heading: z.string().nullish().transform((h) => h ?? null), // which way the turtle faces there
    side: z.string(), // one of STATION_SIDES
    world: z.string().nullish().transform((w) => w ?? null),
    dimension: z.string().nullish().transform((d) => d ?? null),
    ts: z.number(), // created or last replaced, unix seconds
});
export type Station = z.infer<typeof StationSchema>;

export const StationListSchema = z.array(StationSchema);

/** protocol.api.StationRequest: body of POST /api/stations and PUT /api/stations/{id}. */
export interface StationRequest {
    name: string;
    type: StationType;
    x: number;
    y: number;
    z: number;
    heading: Heading | null; // required when side is "front"
    side: StationSide;
    world: string | null;
    dimension: string | null;
}

/** protocol.api.TripStatuses: values of Trip.status. */
export const TripStatuses = {
    MOVING: "moving", // following a path; replanned when something is in the way
    ARRIVED: "arrived",
    FAILED: "failed", // see Trip.error
    CANCELLED: "cancelled",
} as const;

/** protocol.api.GotoRequest: body of POST /api/turtles/{id}/goto. A null heading leaves the turtle facing any way. */
export interface GotoRequest {
    x: number;
    y: number;
    z: number;
    heading: Heading | null;
}

/**
 * protocol.api.Trip: a turtle's journey to a goal. The server plans the path, and plans a new one from where the turtle
 * stopped when something is in the way.
 */
export const TripSchema = z.object({
    tripId: z.number().int(),
    x: z.number().int(),
    y: z.number().int(),
    z: z.number().int(),
    heading: z.string().nullish().transform((h) => h ?? null),
    status: z.string(), // one of TripStatuses
    pathId: z.number().int(),
    steps: z.number().int(), // steps in the current path
    fuel: z.number().int(), // fuel the current path needs
    replans: z.number().int(), // new paths planned after the first
    error: z.string().nullish().transform((e) => e ?? null), // why it failed
    started: z.number(), // unix seconds
    updated: z.number(),
});
export type Trip = z.infer<typeof TripSchema>;

// --- Zones ---

/** protocol.api.ZoneTypes: no-dig zones are never dug by planned routes; quarries are for the server to mine later. */
export const ZONE_TYPES = ["nodig", "quarry"] as const;
export type ZoneType = (typeof ZONE_TYPES)[number];

/** protocol.api.MAX_ZONE_NAME_LENGTH: same limit as station names. */
export const MAX_ZONE_NAME_LENGTH = 32;

/**
 * protocol.api.Zone: a box of blocks with a purpose, shared by the whole fleet. X and Z are always bounded and
 * inclusive; a null minY or maxY leaves the box open downwards or upwards.
 */
export const ZoneSchema = z.object({
    zoneId: z.number().int(),
    name: z.string(),
    type: z.string(), // one of ZONE_TYPES
    minX: z.number().int(),
    maxX: z.number().int(),
    minZ: z.number().int(),
    maxZ: z.number().int(),
    minY: z.number().int().nullish().transform((y) => y ?? null),
    maxY: z.number().int().nullish().transform((y) => y ?? null),
    world: z.string().nullish().transform((w) => w ?? null),
    dimension: z.string().nullish().transform((d) => d ?? null),
    ts: z.number(), // created or last replaced, unix seconds
});
export type Zone = z.infer<typeof ZoneSchema>;

export const ZoneListSchema = z.array(ZoneSchema);

/** protocol.api.ZoneRequest: body of POST /api/zones and PUT /api/zones/{id}. */
export interface ZoneRequest {
    name: string;
    type: ZoneType;
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    minY: number | null;
    maxY: number | null;
    world: string | null;
    dimension: string | null;
}
