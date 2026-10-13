import type {z} from "zod";
import {
    ApiErrorSchema,
    type Command,
    type CommandRequest,
    type EquipmentSeedRequest,
    type LabelRequest,
    type MapBox,
    type MapRegion,
    MapRegionSchema,
    type PositionSeed,
    PositionSeedSchema,
    type RefuelCommand,
    RefuelCommandSchema,
    type RefuelRequest,
    type SeedRequest,
    type SelectSlotRequest,
    SelectSlotRequestSchema,
    type TurtleCommand,
    TurtleCommandSchema,
    type TurtleInventory,
    TurtleInventorySchema,
    type TurtleStatus,
    TurtleStatusListSchema,
    TurtleStatusSchema,
} from "./schemas";

/** Empty in development (Vite proxies /api and /ws); the Kotlin server's origin in production. */
export const API_BASE_URL = trimTrailingSlashes(import.meta.env.VITE_API_URL ?? "");

function trimTrailingSlashes(url: string): string {
    let end = url.length;
    while (end > 0 && url[end - 1] === "/") end--;
    return url.slice(0, end);
}

// Free ngrok domains serve an interstitial page to browsers unless this header is present.
const extraHeaders: Record<string, string> = API_BASE_URL.includes("ngrok")
    ? {"ngrok-skip-browser-warning": "true"}
    : {};

export class ApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
        this.name = "ApiError";
    }
}

async function request<S extends z.ZodTypeAny>(path: string, schema: S, init?: RequestInit): Promise<z.output<S>> {
    const res = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: {Accept: "application/json", ...extraHeaders, ...init?.headers},
    });

    if (!res.ok) {
        const body: unknown = await res.json().catch(() => null);
        const parsed = ApiErrorSchema.safeParse(body);
        throw new ApiError(parsed.success ? parsed.data.error : `${res.status} ${res.statusText}`, res.status);
    }

    return schema.parse(await res.json());
}

export function fetchTurtles(): Promise<TurtleStatus[]> {
    return request("/api/turtles", TurtleStatusListSchema);
}

export function fetchTurtle(id: number): Promise<TurtleStatus> {
    return request(`/api/turtles/${id}`, TurtleStatusSchema);
}

/**
 * Tells a turtle where it is and which way it faces. The server queues the seed (202) and hands it to the
 * turtle on its next heartbeat; the turtle doesn't need to be registered yet.
 */
export function seedTurtle(id: number, seed: SeedRequest): Promise<PositionSeed> {
    return request(`/api/turtles/${id}/seed`, PositionSeedSchema, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({source: "dashboard", ...seed}),
    });
}

/**
 * Renames a turtle (a null label clears it). The server queues the rename (202) and the turtle applies it with
 * os.setComputerLabel on its next heartbeat; the turtle doesn't need to be registered yet.
 */
export function renameTurtle(id: number, label: string | null): Promise<TurtleStatus> {
    const body: LabelRequest = {label};
    return request(`/api/turtles/${id}/label`, TurtleStatusSchema, {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
    });
}

/**
 * Says what a turtle has equipped, for turtles whose CC: Tweaked can't see their tools. Stored right away and kept until
 * the turtle reports equipment with item names; 404 if the server doesn't know the turtle.
 */
export function seedEquipment(id: number, equipment: EquipmentSeedRequest): Promise<TurtleStatus> {
    return request(`/api/turtles/${id}/equipment`, TurtleStatusSchema, {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(equipment),
    });
}

/** The turtle's last reported inventory, or null if it has never reported one (404). */
export async function fetchInventory(id: number): Promise<TurtleInventory | null> {
    try {
        return await request(`/api/turtles/${id}/inventory`, TurtleInventorySchema);
    } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
    }
}

/**
 * Tells a connected turtle to select a slot (1-16). Not queued: the server answers 409 if the turtle is offline.
 * The new selection shows up once the turtle reports its inventory again.
 */
export function selectSlot(id: number, slot: number): Promise<SelectSlotRequest> {
    const body: SelectSlotRequest = {slot};
    return request(`/api/turtles/${id}/inventory/selected`, SelectSlotRequestSchema, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
    });
}

/**
 * Tells a connected turtle to burn `count` items from its selected slot as fuel (null burns the whole stack). Not
 * queued: 409 if the turtle is offline. The outcome shows up as the inventory's `lastRefuel` with the same refuelId.
 */
export function refuelTurtle(id: number, count: number | null): Promise<RefuelCommand> {
    const body: RefuelRequest = {count};
    return request(`/api/turtles/${id}/refuel`, RefuelCommandSchema, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
    });
}

/**
 * Tells a connected turtle to run one command (move, turn, dig...). Not queued: 409 if the turtle is offline. The
 * outcome shows up as the turtle's `lastCommand` with the same commandId.
 */
export function sendCommand(id: number, command: Command): Promise<TurtleCommand> {
    const body: CommandRequest = {command};
    return request(`/api/turtles/${id}/commands`, TurtleCommandSchema, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
    });
}

/**
 * The blocks turtles have seen inside a box (at most MAX_MAP_QUERY_SPAN along each axis). Unseen cells are left out,
 * and so is known air, which the dashboard doesn't draw (servers without excludeAir still send it).
 */
export function fetchMapBlocks({world, dimension, ...bounds}: MapBox): Promise<MapRegion> {
    const params = new URLSearchParams(Object.entries(bounds).map(([k, v]) => [k, String(v)]));
    params.set("excludeAir", "true");
    if (world != null) params.set("world", world);
    if (dimension != null) params.set("dimension", dimension);
    return request(`/api/map/blocks?${params}`, MapRegionSchema);
}

/** ws(s):// URL for a server path, honouring VITE_API_URL when set. */
export function wsUrl(path: string): string {
    const base = API_BASE_URL || globalThis.location.origin;
    return base.replace(/^http/, "ws") + path;
}
