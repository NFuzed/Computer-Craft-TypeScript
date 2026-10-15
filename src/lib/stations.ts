import type {Station, StationSide, StationType} from "../api/schemas";
import {UNKNOWN_DIMENSION} from "./fleet";

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

export function stationTypeLabel(type: string): string {
    return STATION_TYPE_LABELS[type as StationType] ?? type;
}

export function stationSideLabel(side: string): string {
    return STATION_SIDE_LABELS[side as StationSide] ?? side;
}

/** Each dimension's stations, dimensions by name. Stations keep the order they came in. */
export function stationsByDimension(stations: Station[]): [string, Station[]][] {
    const groups = new Map<string, Station[]>();
    for (const s of stations) {
        const d = s.dimension ?? UNKNOWN_DIMENSION;
        groups.set(d, [...(groups.get(d) ?? []), s]);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
