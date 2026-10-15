import {type FormEvent, useState} from "react";
import {
    type Heading,
    HEADINGS,
    MAX_STATION_NAME_LENGTH,
    STATION_SIDES,
    STATION_TYPES,
    type StationSide,
    type StationType,
    type TurtleStatus,
} from "../api/schemas";
import {useCreateStation} from "../hooks/useStations";
import {useKnownPlaces} from "../hooks/useTurtles";
import {NO_WORLD} from "../lib/fleet";
import {turtleName} from "../lib/format";
import {STATION_SIDE_LABELS, STATION_TYPE_LABELS} from "../lib/stations";
import {NONE, type Place, placeError, placeName, placeOf, PlaceSelect} from "./PlaceSelect";
import {Segmented} from "./Segmented";

interface Props {
    /** The world the dashboard is showing, which new stations start in. */
    world: string | null;
    /** The selected turtle, whose position can be copied into the form. */
    turtle: TurtleStatus | undefined;
    /** Called when the station is added or the form is cancelled. */
    onDone: () => void;
}

const COORDS = ["x", "y", "z"] as const;
type Coord = (typeof COORDS)[number];

/** "" is no heading: the turtle can face any way there. */
type HeadingChoice = Heading | "";

const HEADING_OPTIONS: { value: HeadingChoice; text: string }[] = [
    {value: "", text: "Any"},
    ...HEADINGS.map((h) => ({value: h, text: h})),
];
const SIDE_OPTIONS = STATION_SIDES.map((s) => ({value: s, text: STATION_SIDE_LABELS[s]}));

function isHeading(h: string | null | undefined): h is Heading {
    return (HEADINGS as readonly string[]).includes(h ?? "");
}

/** Why `name` can't be a station name, mirroring the server's check. */
function nameError(name: string): string | null {
    if (!name) return "Enter a name for the station.";
    if (name.length > MAX_STATION_NAME_LENGTH) return `At most ${MAX_STATION_NAME_LENGTH} characters (${name.length}).`;
    if (/[^ -~]/.test(name)) return "Only printable ASCII characters are allowed.";
    return null;
}

/**
 * Adds a station: the cell a turtle stands in, which side the chest is on and what it's for. The coordinates can be
 * copied from the selected turtle, so a turtle can be driven to the spot and the station added where it stands.
 */
export function StationForm({world: shownWorld, turtle, onDone}: Readonly<Props>) {
    const [name, setName] = useState("");
    const [type, setType] = useState<StationType>("fuel");
    const [coords, setCoords] = useState<Record<Coord, string>>({x: "", y: "", z: ""});
    const [side, setSide] = useState<StationSide>("up");
    const [heading, setHeading] = useState<HeadingChoice>("");
    const [world, setWorld] = useState(placeOf(shownWorld === NO_WORLD ? null : shownWorld));
    const [dimension, setDimension] = useState(placeOf(turtle?.position?.dimension));

    const places = useKnownPlaces();
    const worlds = [...places.keys()].filter((w) => w !== "");
    const dimensionsIn = (w: Place) => (w.kind === "new" ? [] : (places.get(placeName(w) ?? "") ?? []));

    function chooseWorld(next: Place) {
        setWorld(next);
        // Keep the dimension only if the new world has it too; a typed-in new dimension is kept as it is
        if (dimension.kind === "existing" && !dimensionsIn(next).includes(dimension.name)) setDimension(NONE);
    }

    const pos = turtle?.position;

    function copyTurtle() {
        if (!pos) return;
        setCoords({x: String(pos.x), y: String(pos.y), z: String(pos.z)});
        setHeading(isHeading(pos.heading) ? pos.heading : "");
        setWorld(placeOf(pos.world));
        setDimension(placeOf(pos.dimension));
    }

    const create = useCreateStation();

    const trimmed = name.trim();
    const parsed = COORDS.map((c) => Number(coords[c]));
    const coordsValid = COORDS.every((c) => coords[c].trim() !== "") && parsed.every(Number.isInteger);
    const problem = nameError(trimmed)
        ?? (coordsValid ? null : "X, Y and Z must be whole numbers.")
        ?? (side === "front" && !heading ? "Pick a heading, so the turtle faces the chest in front of it." : null)
        ?? placeError(world, "world")
        ?? placeError(dimension, "dimension");
    const canAdd = !problem && !create.isPending;
    // The name and coordinates start empty, so only complain once something has been filled in
    const touched = trimmed !== "" || COORDS.some((c) => coords[c] !== "");
    let message: string | null = null;
    if (create.isError) message = create.error.message;
    else if (touched) message = problem;

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (!canAdd) return;
        const [x, y, z] = parsed as [number, number, number];
        try {
            await create.mutateAsync({
                name: trimmed, type, x, y, z, side,
                heading: heading || null,
                world: placeName(world),
                dimension: placeName(dimension),
            });
            onDone();
        } catch {
            // Shown from the mutation's error below; the form stays open so it can be fixed
        }
    }

    return (
        <form className="seed-form" onSubmit={submit}>
            <div className="seed-place">
                <label>
                    <span className="muted small">Name</span>
                    <input
                        type="text"
                        maxLength={MAX_STATION_NAME_LENGTH}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoFocus
                    />
                </label>
                <label>
                    <span className="muted small">Type</span>
                    <select className="select" value={type} onChange={(e) => setType(e.target.value as StationType)}>
                        {STATION_TYPES.map((t) => (
                            <option key={t} value={t}>{STATION_TYPE_LABELS[t]}</option>
                        ))}
                    </select>
                </label>
            </div>

            <div className="seed-coords">
                {COORDS.map((c) => (
                    <label key={c}>
                        <span className="muted small">{c.toUpperCase()}</span>
                        <input
                            type="number"
                            step={1}
                            value={coords[c]}
                            onChange={(e) => setCoords((prev) => ({...prev, [c]: e.target.value}))}
                        />
                    </label>
                ))}
            </div>
            {turtle && (
                <button type="button" className="secondary section-action" onClick={copyTurtle} disabled={!pos}
                        title={pos ? undefined : "This turtle has no position yet"}>
                    Use {turtleName(turtle)}’s position
                </button>
            )}

            <Segmented legend="Chest" name="station-side" options={SIDE_OPTIONS} value={side} onChange={setSide}/>
            <Segmented legend="Turtle faces" name="station-heading" options={HEADING_OPTIONS} value={heading}
                       onChange={setHeading}/>

            <div className="seed-place">
                <PlaceSelect label="World" what="world" options={worlds} value={world} onChange={chooseWorld}/>
                <PlaceSelect label="Dimension" what="dimension" options={dimensionsIn(world)} value={dimension}
                             onChange={setDimension}/>
            </div>

            <div className="seed-actions">
                <button type="submit" className="primary" disabled={!canAdd}>
                    {create.isPending ? "Adding…" : "Add station"}
                </button>
                <button type="button" className="secondary" onClick={onDone} disabled={create.isPending}>
                    Cancel
                </button>
            </div>

            {message && <p className="seed-error small" role="alert">{message}</p>}
        </form>
    );
}
