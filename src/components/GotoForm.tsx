import {type FormEvent, useState} from "react";
import {type Heading, HEADINGS, type Trip, TripStatuses, type TurtleStatus} from "../api/schemas";
import {useStations} from "../hooks/useStations";
import type {useTrip} from "../hooks/useTrip";
import {stationTypeLabel} from "../lib/stations";
import {Segmented} from "./Segmented";

interface Props {
    turtle: TurtleStatus;
    /** The turtle's trip state, shared with the command pad so it can hold back commands while the turtle travels. */
    trip: ReturnType<typeof useTrip>;
}

const COORDS = ["x", "y", "z"] as const;
type Coord = (typeof COORDS)[number];

/** "" is no heading: the turtle stops facing whichever way it arrived. */
type HeadingChoice = Heading | "";

const HEADING_OPTIONS: { value: HeadingChoice; text: string }[] = [
    {value: "", text: "Any"},
    ...HEADINGS.map((h) => ({value: h, text: h})),
];

function isHeading(h: string | null | undefined): h is Heading {
    return (HEADINGS as readonly string[]).includes(h ?? "");
}

function goalText({x, y, z, heading}: { x: number; y: number; z: number; heading: string | null }): string {
    const coords = `${x} / ${y} / ${z}`;
    return heading ? `${coords} ${heading}` : coords;
}

function replansText(replans: number): string {
    return replans === 1 ? "once" : `${replans} times`;
}

/**
 * Sends the turtle to a block, typed in or picked from the stations in its world and dimension. The server plans the
 * route around the blocks turtles have seen, and plans again when the turtle runs into something.
 */
export function GotoForm({turtle, trip: {trip, moving, go, cancel}}: Readonly<Props>) {
    // Start from the last goal, so a failed trip can be sent again
    const [coords, setCoords] = useState<Record<Coord, string>>({
        x: String(trip?.x ?? ""),
        y: String(trip?.y ?? ""),
        z: String(trip?.z ?? ""),
    });
    const [heading, setHeading] = useState<HeadingChoice>(isHeading(trip?.heading) ? trip.heading : "");
    const [stationId, setStationId] = useState("");

    const pos = turtle.position;
    const {data: stations = []} = useStations();
    const reachable = pos
        ? stations.filter((s) => s.world === pos.world && s.dimension === pos.dimension)
        : [];

    function edit(c: Coord, value: string) {
        setCoords((prev) => ({...prev, [c]: value}));
        setStationId("");
    }

    function pickStation(id: string) {
        setStationId(id);
        const station = reachable.find((s) => String(s.stationId) === id);
        if (!station) return;
        setCoords({x: String(station.x), y: String(station.y), z: String(station.z)});
        setHeading(isHeading(station.heading) ? station.heading : "");
    }

    const parsed = COORDS.map((c) => Number(coords[c]));
    const coordsValid = COORDS.every((c) => coords[c].trim() !== "") && parsed.every(Number.isInteger);
    let blocked: string | null = null;
    if (!turtle.online) blocked = "The turtle is offline.";
    else if (!pos) blocked = "Set the turtle’s position above before sending it anywhere.";
    const canGo = !blocked && coordsValid && !go.isPending && !moving;

    function submit(e: FormEvent) {
        e.preventDefault();
        if (!canGo) return;
        const [x, y, z] = parsed as [number, number, number];
        go.mutate({x, y, z, heading: heading || null});
    }

    return (
        <form className="seed-form goto-form" onSubmit={submit}>
            {reachable.length > 0 && (
                <label>
                    <span className="muted small">Station</span>
                    <select className="select" value={stationId} onChange={(e) => pickStation(e.target.value)}
                            disabled={moving}>
                        <option value="">Coordinates below</option>
                        {reachable.map((s) => (
                            <option key={s.stationId} value={s.stationId}>
                                {s.name} ({stationTypeLabel(s.type).toLowerCase()})
                            </option>
                        ))}
                    </select>
                </label>
            )}

            <div className="seed-coords">
                {COORDS.map((c) => (
                    <label key={c}>
                        <span className="muted small">{c.toUpperCase()}</span>
                        <input
                            type="number"
                            step={1}
                            value={coords[c]}
                            disabled={moving}
                            placeholder={pos ? String(pos[c]) : undefined}
                            onChange={(e) => edit(c, e.target.value)}
                        />
                    </label>
                ))}
            </div>

            <Segmented legend="Facing" name={`goto-heading-${turtle.turtleId}`} options={HEADING_OPTIONS}
                       value={heading} onChange={setHeading}/>

            <div className="seed-actions">
                {moving ? (
                    <button type="button" className="secondary goto-stop" onClick={() => cancel.mutate()}
                            disabled={cancel.isPending}>
                        {cancel.isPending ? "Stopping…" : "Stop"}
                    </button>
                ) : (
                    <button type="submit" className="primary" disabled={!canGo} title={blocked ?? undefined}>
                        {go.isPending ? "Planning…" : "Go"}
                    </button>
                )}
            </div>

            {blocked && !moving && <p className="muted small">{blocked}</p>}
            <TripOutcome trip={trip} error={go.error ?? cancel.error}/>
        </form>
    );
}

function TripOutcome({trip, error}: Readonly<{ trip: Trip | null; error: Error | null }>) {
    if (error) return <p className="label-error small" role="alert">{error.message}</p>;
    if (!trip) return null;
    const goal = <span className="mono">{goalText(trip)}</span>;
    switch (trip.status) {
        case TripStatuses.MOVING:
            return (
                <p className="seed-pending small">
                    On the way to {goal}: {trip.steps} steps, {trip.fuel} fuel
                    {trip.replans > 0 && `, route replanned ${replansText(trip.replans)}`}.
                </p>
            );
        case TripStatuses.ARRIVED:
            return <output className="refuel-ok small">Arrived at {goal}.</output>;
        case TripStatuses.CANCELLED:
            return <p className="muted small">Stopped on the way to {goal}{trip.error && `: ${trip.error}`}.</p>;
        default:
            return (
                <p className="label-error small" role="alert">
                    Couldn’t reach {goal}: {trip.error ?? "unknown reason"}
                </p>
            );
    }
}
