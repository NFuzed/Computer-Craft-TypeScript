import type {Station, StationType, TurtleStatus} from "../api/schemas";
import {useStations} from "../hooks/useStations";
import {useTrip} from "../hooks/useTrip";
import {turtleName} from "../lib/format";
import {nearestStation, stationDistance, stationGoal} from "../lib/stations";
import {ContextMenu, type MenuEntry} from "./ContextMenu";

type Placed = TurtleStatus & { position: NonNullable<TurtleStatus["position"]> };

interface Props {
    turtle: Placed;
    /** Where it was right-clicked, in client px. */
    x: number;
    y: number;
    /** Whether the map's camera is locked onto this turtle. */
    locked: boolean;
    onLock: () => void;
    onUnlock: () => void;
    onClose: () => void;
}

/** The trips the menu offers, in order: one per station type, to the nearest of that type. */
const STATION_TRIPS: { type: StationType; label: string }[] = [
    {type: "fuel", label: "Go refuel"},
    {type: "drop", label: "Go drop off"},
    {type: "pickup", label: "Go pick up"},
];

function blocksText(blocks: number): string {
    return blocks === 1 ? "1 block" : `${blocks} blocks`;
}

/**
 * The map's right-click menu for a turtle. Each group of entries comes from its own function below and groups are split
 * by separators, so a new feature is a new function added to the list in TurtleMenu.
 */
export function TurtleMenu({turtle, x, y, locked, onLock, onUnlock, onClose}: Readonly<Props>) {
    const trip = useTrip(turtle.turtleId);
    const {data: stations = []} = useStations();

    const groups = [
        tripEntries(turtle, trip, stations),
        cameraEntries(locked, onLock, onUnlock),
    ];
    const entries = groups.flatMap((group, i) =>
        i === 0 ? group : [{kind: "separator", key: `separator-${i}`} as const, ...group],
    );

    return <ContextMenu x={x} y={y} heading={turtleName(turtle)} entries={entries} onClose={onClose}/>;
}

/** Send the turtle to the nearest station of each type, or stop the trip it's on. */
function tripEntries(
    turtle: Placed,
    {moving, go, cancel}: ReturnType<typeof useTrip>,
    stations: Station[],
): MenuEntry[] {
    let blocked: string | undefined;
    if (!turtle.online) blocked = "The turtle is offline";
    else if (moving) blocked = "The turtle is already on a trip";

    const entries: MenuEntry[] = STATION_TRIPS.map(({type, label}) => {
        const station = nearestStation(stations, turtle.position, type);
        if (!station) {
            return {
                kind: "item",
                key: `goto-${type}`,
                label,
                hint: "none here",
                disabled: true,
                title: "No station of this type in the turtle’s world and dimension",
            };
        }
        const distance = blocksText(stationDistance(station, turtle.position));
        return {
            kind: "item",
            key: `goto-${type}`,
            label,
            hint: `${station.name} · ${distance}`,
            disabled: blocked !== undefined,
            title: blocked ?? `Go to ${station.name}, the nearest one (at least ${distance} away)`,
            onSelect: () => go.mutateAsync(stationGoal(station)),
        };
    });

    if (moving) {
        entries.unshift({kind: "item", key: "stop", label: "Stop trip", onSelect: () => cancel.mutateAsync()});
    }
    return entries;
}

/** Lock the map's camera onto the turtle, so the map follows it until it's dragged. */
function cameraEntries(locked: boolean, onLock: () => void, onUnlock: () => void): MenuEntry[] {
    return [
        locked
            ? {kind: "item", key: "camera", label: "Unlock camera", onSelect: onUnlock}
            : {
                kind: "item",
                key: "camera",
                label: "Lock camera",
                title: "Keep the map centred on this turtle until the map is dragged",
                onSelect: onLock,
            },
    ];
}
