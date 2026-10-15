import {
    type GotoRequest,
    type Heading,
    HEADINGS,
    type Station,
    type StationSide,
    type StationType,
    type TurtlePosition,
} from "../api/schemas";
import {NO_WORLD, UNKNOWN_DIMENSION} from "./fleet";

export const STATION_TYPE_LABELS: Record<StationType, string> = {
    fuel: "Fuel",
    drop: "Drop-off",
    pickup: "Pickup",
};

/** Where the chest is, seen from the cell the turtle stands in. */
export const STATION_SIDE_LABELS: Record<StationSide, string> = {
    up: "Above",
    down: "Below",
    front: "In front",
};

/**
 * Each type's colour on the map, as a hex for three.js. The same colours as the .station-badge and .station-marker
 * classes in index.css, which WebGL can't read.
 */
export const STATION_HEX: Record<StationType, number> = {
    fuel: 0xefb35a,
    drop: 0x4cc39b,
    pickup: 0x6aaef0,
};

/** For a type the dashboard doesn't know: --muted. */
export const UNKNOWN_STATION_HEX = 0x7d9ab8;

export function stationHex(type: string): number {
    return STATION_HEX[type as StationType] ?? UNKNOWN_STATION_HEX;
}

/** The stations in a world (NO_WORLD for those without one), or all of them when no world is chosen. */
export function stationsIn(stations: Station[], world: string | null): Station[] {
    return world == null ? stations : stations.filter((s) => (s.world ?? NO_WORLD) === world);
}

export function stationDimension(station: Station): string {
    return station.dimension ?? UNKNOWN_DIMENSION;
}

// Minecraft: north is -Z, east is +X
const HEADING_STEPS: Record<string, [number, number]> = {N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0]};

/** The block the station's chest is in, or null for a chest in front with no heading (the server refuses those). */
export function chestCell({x, y, z, side, heading}: Station): { x: number; y: number; z: number } | null {
    if (side === "up") return {x, y: y + 1, z};
    if (side === "down") return {x, y: y - 1, z};
    const step = heading == null ? undefined : HEADING_STEPS[heading.toUpperCase()];
    return step ? {x: x + step[0], y, z: z + step[1]} : null;
}

export function stationTypeLabel(type: string): string {
    return STATION_TYPE_LABELS[type as StationType] ?? type;
}

export function stationSideLabel(side: string): string {
    return STATION_SIDE_LABELS[side as StationSide] ?? side;
}

/** What a station is and where, for its tooltip on the maps. */
export function stationTitle(station: Station): string {
    const {name, type, x, y, z, side} = station;
    const chest = stationSideLabel(side).toLowerCase();
    return `${name}: ${stationTypeLabel(type)} station (${x}, ${y}, ${z}), chest ${chest}`;
}

/**
 * Blocks between a position and a station, counted the way a turtle moves: one axis at a time. The route the server
 * plans goes around things, so it's never shorter than this.
 */
export function stationDistance(station: Station, pos: { x: number; y: number; z: number }): number {
    return Math.abs(station.x - pos.x) + Math.abs(station.y - pos.y) + Math.abs(station.z - pos.z);
}

/** The closest station of a type in the position's world and dimension, or undefined when there's none. */
export function nearestStation(stations: Station[], pos: TurtlePosition, type: StationType): Station | undefined {
    let nearest: Station | undefined;
    for (const s of stations) {
        if (s.type !== type || s.world !== pos.world || s.dimension !== pos.dimension) continue;
        if (!nearest || stationDistance(s, pos) < stationDistance(nearest, pos)) nearest = s;
    }
    return nearest;
}

/** The goal that sends a turtle to a station: its standing cell, facing the way the station says. */
export function stationGoal({x, y, z, heading}: Station): GotoRequest {
    const h = heading?.toUpperCase();
    return {x, y, z, heading: (HEADINGS as readonly string[]).includes(h ?? "") ? (h as Heading) : null};
}

/** Each dimension's stations, dimensions by name. Stations keep the order they came in. */
export function stationsByDimension(stations: Station[]): [string, Station[]][] {
    const groups = new Map<string, Station[]>();
    for (const s of stations) {
        const d = stationDimension(s);
        groups.set(d, [...(groups.get(d) ?? []), s]);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
