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

/** protocol.api.TurtleStatus */
export const TurtleStatusSchema = z.object({
    turtleId: z.number().int(),
    label: z.string().nullish().transform((l) => l ?? null),
    online: z.boolean(),
    lastSeen: z.number().nullish().transform((t) => t ?? null), // unix seconds, null if never seen
    position: TurtlePositionSchema.nullish().transform((p) => p ?? null),
    pendingSeed: PositionSeedSchema.nullish().transform((s) => s ?? null), // sent but not yet applied by the turtle
    pendingLabel: PendingLabelSchema.nullish().transform((l) => l ?? null), // rename not yet applied by the turtle
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
