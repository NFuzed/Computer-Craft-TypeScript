import type {Zone, ZoneRequest, ZoneType} from "../api/schemas";
import {NO_WORLD, UNKNOWN_DIMENSION} from "./fleet";

export const ZONE_TYPE_LABELS: Record<ZoneType, string> = {
    nodig: "No-dig",
    quarry: "Quarry",
};

export function zoneTypeLabel(type: string): string {
    return ZONE_TYPE_LABELS[type as ZoneType] ?? type;
}

/** A box of whole blocks on the map, inclusive at both ends, like a zone's X and Z. */
export interface Area {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
}

/** The area covering two corner blocks, in either order. */
export function areaBetween(a: { x: number; z: number }, b: { x: number; z: number }): Area {
    return {minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z)};
}

/** "12 × 8": blocks across X by blocks across Z. */
export function areaSizeText({minX, maxX, minZ, maxZ}: Area): string {
    return `${maxX - minX + 1} × ${maxZ - minZ + 1}`;
}

/** "-4, 10 → 7, 17": the two corners. */
export function areaCornersText({minX, maxX, minZ, maxZ}: Area): string {
    return `${minX}, ${minZ} → ${maxX}, ${maxZ}`;
}

/** "any Y", "Y ≥ 12", "Y ≤ 60" or "Y 12 to 60". */
export function yRangeText({minY, maxY}: Pick<Zone, "minY" | "maxY">): string {
    if (minY == null && maxY == null) return "any Y";
    if (maxY == null) return `Y ≥ ${minY}`;
    if (minY == null) return `Y ≤ ${maxY}`;
    return `Y ${minY} to ${maxY}`;
}

export function zoneDimension(zone: Zone): string {
    return zone.dimension ?? UNKNOWN_DIMENSION;
}

/** The zones in a world (NO_WORLD for those without one), or all of them when no world is chosen. */
export function zonesIn(zones: Zone[], world: string | null): Zone[] {
    return world == null ? zones : zones.filter((z) => (z.world ?? NO_WORLD) === world);
}

/** Each dimension's zones, dimensions by name. Zones keep the order they came in. */
export function zonesByDimension(zones: Zone[]): [string, Zone[]][] {
    const groups = new Map<string, Zone[]>();
    for (const z of zones) {
        const d = zoneDimension(z);
        groups.set(d, [...(groups.get(d) ?? []), z]);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** What a zone is and where, for its tooltip on the map. */
export function zoneTitle(zone: Zone): string {
    return `${zone.name}: ${zoneTypeLabel(zone.type)} zone, ${areaCornersText(zone)}, ${yRangeText(zone)}`;
}

/** The first free "<Type> <n>" name, so zones made on the map can be told apart until they're renamed. */
export function nextZoneName(zones: Zone[], type: ZoneType): string {
    const label = zoneTypeLabel(type);
    const taken = new Set(zones.map((z) => z.name));
    let n = 1;
    while (taken.has(`${label} ${n}`)) n++;
    return `${label} ${n}`;
}

/**
 * A new zone over an area of the map, unbounded in Y: the Zones panel sets limits. The map's "no world" and "unknown
 * dimension" keys are stored as null, the way the server reports them.
 */
export function zoneRequestFor(
    area: Area,
    type: ZoneType,
    name: string,
    world: string | null,
    dimension: string,
): ZoneRequest {
    return {
        ...area,
        name,
        type,
        minY: null,
        maxY: null,
        world: world === NO_WORLD ? null : world,
        dimension: dimension === UNKNOWN_DIMENSION ? null : dimension,
    };
}
