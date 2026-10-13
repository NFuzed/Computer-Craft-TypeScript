import {useQuery} from "@tanstack/react-query";
import {fetchMapBlocks} from "../api/client";
import type {MapBox, TurtleStatus} from "../api/schemas";

type Placed = TurtleStatus & { position: NonNullable<TurtleStatus["position"]> };

/** Every world map query starts with this, so they can all be refetched at once. */
export const worldMapQueryKey = ["map-blocks"] as const;

/**
 * /ws/dashboard has no world map event, so the map is polled while it's shown. Commands sent from the dashboard refetch
 * it as soon as their result arrives (see useTurtleCommand); polling picks up everything else.
 */
const POLL_MS = 5_000;

/** Minecraft's chunk size. The box is made of whole chunks, so it lines up with how the server will store the map. */
export const CHUNK_SIZE = 16;

/**
 * View distances the map offers, in chunks around the focus chunk, like Minecraft's render distance. The largest is
 * the most whole chunks that fit in the server's MAX_MAP_QUERY_SPAN: (2 × 7 + 1) × 16 = 240 blocks.
 */
export const VIEW_DISTANCES = [1, 2, 4, 7] as const;
export type ViewDistance = (typeof VIEW_DISTANCES)[number];
export const DEFAULT_VIEW_DISTANCE: ViewDistance = 2;

/** Blocks across the box for a view distance. */
export function viewSpan(chunks: ViewDistance): number {
    return (2 * chunks + 1) * CHUNK_SIZE;
}

/** The chunks from `chunks` before the one holding `center` to `chunks` after it, as block coordinates. */
function axisRange(center: number, chunks: ViewDistance): [number, number] {
    const min = (Math.floor(center / CHUNK_SIZE) - chunks) * CHUNK_SIZE;
    return [min, min + viewSpan(chunks) - 1];
}

/** The world the most turtles are in, so the map shows the busiest world when turtles disagree. */
function busiestWorld(turtles: Placed[]): string | null {
    const counts = new Map<string | null, number>();
    for (const t of turtles) counts.set(t.position.world, (counts.get(t.position.world) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * The box of the world map to show: `chunks` chunks each way around the selected turtle, or else the middle of the
 * turtles. It only moves when that point crosses into another chunk. Turtles outside it are drawn without the blocks
 * around them.
 */
export function mapBoxFor(turtles: Placed[], selected: Placed | undefined, chunks: ViewDistance): MapBox | null {
    const focus = selected ? [selected] : turtles;
    if (focus.length === 0) return null;
    const mid = (axis: "x" | "y" | "z") => {
        const values = focus.map((t) => t.position[axis]);
        return (Math.min(...values) + Math.max(...values)) / 2;
    };
    const [minX, maxX] = axisRange(mid("x"), chunks);
    const [minY, maxY] = axisRange(mid("y"), chunks);
    const [minZ, maxZ] = axisRange(mid("z"), chunks);
    // Every turtle on one map shares a dimension; the world comes from the seed and may differ between them.
    const world = selected ? selected.position.world : busiestWorld(turtles);
    return {minX, minY, minZ, maxX, maxY, maxZ, world, dimension: focus[0]!.position.dimension};
}

/**
 * The blocks turtles have seen in `box`, refreshed every few seconds. While a moved box loads, the last region stays up
 * unless it was another world or dimension.
 */
export function useWorldMap(box: MapBox | null) {
    return useQuery({
        queryKey: [...worldMapQueryKey, box] as const,
        queryFn: () => fetchMapBlocks(box!),
        enabled: box != null,
        refetchInterval: POLL_MS,
        placeholderData: (previous, previousQuery) => {
            const was = previousQuery?.queryKey[1];
            return was?.world === box?.world && was?.dimension === box?.dimension ? previous : undefined;
        },
    });
}
