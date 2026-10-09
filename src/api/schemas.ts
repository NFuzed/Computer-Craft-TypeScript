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

/** protocol.api.TurtleStatus */
export const TurtleStatusSchema = z.object({
    turtleId: z.number().int(),
    label: z.string().nullish().transform((l) => l ?? null),
    online: z.boolean(),
    lastSeen: z.number().nullish().transform((t) => t ?? null), // unix seconds, null if never seen
    position: TurtlePositionSchema.nullish().transform((p) => p ?? null),
    pendingSeed: PositionSeedSchema.nullish().transform((s) => s ?? null), // sent but not yet applied by the turtle
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
