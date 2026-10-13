import type {TurtleStatus} from "../api/schemas";

/** Shown for a turtle whose position has no dimension. */
export const UNKNOWN_DIMENSION = "unknown";

/** The key for turtles whose position has no world. */
export const NO_WORLD = "";

/** Where a turtle is, or is about to be: its reported position, else the seed it's waiting to apply. */
function placeOf(t: TurtleStatus) {
    return t.position ?? t.pendingSeed;
}

/** The turtle's world (NO_WORLD if its position has none), or undefined for a turtle that was never seeded. */
export function turtleWorld(t: TurtleStatus): string | undefined {
    const place = placeOf(t);
    return place ? (place.world ?? NO_WORLD) : undefined;
}

/** The turtle's dimension, or undefined for a turtle that was never seeded. */
export function turtleDimension(t: TurtleStatus): string | undefined {
    const place = placeOf(t);
    return place ? (place.dimension ?? UNKNOWN_DIMENSION) : undefined;
}

export function worldName(world: string): string {
    return world === NO_WORLD ? "No world" : world;
}

/** Each key's turtles, busiest first and then by name. Turtles without a key are left out. */
export function groupBy(turtles: TurtleStatus[], key: (t: TurtleStatus) => string | undefined): [string, TurtleStatus[]][] {
    const groups = new Map<string, TurtleStatus[]>();
    for (const t of turtles) {
        const k = key(t);
        if (k !== undefined) groups.set(k, [...(groups.get(k) ?? []), t]);
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}
