import type {z} from "zod";
import {
    ApiErrorSchema,
    type PositionSeed,
    PositionSeedSchema,
    type SeedRequest,
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

/** ws(s):// URL for a server path, honouring VITE_API_URL when set. */
export function wsUrl(path: string): string {
    const base = API_BASE_URL || globalThis.location.origin;
    return base.replace(/^http/, "ws") + path;
}
