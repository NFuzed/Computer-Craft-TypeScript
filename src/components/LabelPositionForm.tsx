import {type FormEvent, useState} from "react";
import {type Heading, HEADINGS, MAX_LABEL_LENGTH, type TurtleStatus} from "../api/schemas";
import {useKnownPlaces, useRenameTurtle, useSeedTurtle} from "../hooks/useTurtles";

interface Props {
    turtle: TurtleStatus;
    /** Called when the changes are sent or the edit is cancelled. */
    onDone: () => void;
}

const COORDS = ["x", "y", "z"] as const;
type Coord = (typeof COORDS)[number];

function isHeading(h: string | null | undefined): h is Heading {
    return (HEADINGS as readonly string[]).includes(h ?? "");
}

/** A world or dimension picked from a dropdown: none, one already recorded, or a new one typed in. */
type Place = { kind: "none" } | { kind: "existing"; name: string } | { kind: "new"; name: string };

const NONE: Place = {kind: "none"};

function placeOf(name: string | null | undefined): Place {
    return name ? {kind: "existing", name} : NONE;
}

/** The name to send, or null for none. A new name is trimmed; blank is caught by placeError. */
function placeName(place: Place): string | null {
    return place.kind === "none" ? null : place.name.trim() || null;
}

function placeError(place: Place, what: string): string | null {
    return place.kind === "new" && !place.name.trim() ? `Enter a name for the new ${what}.` : null;
}

interface PlaceSelectProps {
    label: string;
    what: string;
    options: string[];
    value: Place;
    onChange: (place: Place) => void;
}

/** A dropdown of the recorded names plus "None" and "Add new…", which shows a text box for the new name. */
function PlaceSelect({label, what, options, value, onChange}: Readonly<PlaceSelectProps>) {
    // The current choice stays listed even if no turtle has it any more, so the dropdown never shows a blank
    const names = value.kind === "existing" && !options.includes(value.name) ? [value.name, ...options] : options;
    const selected = value.kind === "existing" ? `=${value.name}` : value.kind;

    function choose(v: string) {
        if (v === "none") onChange(NONE);
        else if (v === "new") onChange({kind: "new", name: ""});
        else onChange({kind: "existing", name: v.slice(1)});
    }

    return (
        <label>
            <span className="muted small">{label}</span>
            <select className="select" value={selected} onChange={(e) => choose(e.target.value)}>
                <option value="none">None</option>
                {names.map((n) => (
                    <option key={n} value={`=${n}`}>
                        {n}
                    </option>
                ))}
                <option value="new">Add new…</option>
            </select>
            {value.kind === "new" && (
                <input
                    type="text"
                    placeholder={`New ${what} name`}
                    aria-label={`New ${what} name`}
                    value={value.name}
                    onChange={(e) => onChange({kind: "new", name: e.target.value})}
                    autoFocus
                />
            )}
        </label>
    );
}

/** Returns why `label` can't be used, mirroring the server's labelError so we can flag it before sending. */
function labelError(label: string): string | null {
    if (label.length > MAX_LABEL_LENGTH) return `At most ${MAX_LABEL_LENGTH} characters (${label.length}).`;
    // ComputerCraft drops other characters, so the rename would never be acknowledged
    if (/[^ -~]/.test(label)) return "Only printable ASCII characters are allowed.";
    return null;
}

/**
 * Renames a turtle and sets its position and heading. Only what changed is sent: a rename (an empty label clears
 * it) and/or a seed. Turtles have no GPS, so the seed is the starting point for their dead reckoning; seeding
 * again corrects a drifted position. Both are applied by the turtle on its next heartbeat.
 */
export function LabelPositionForm({turtle, onDone}: Readonly<Props>) {
    // Start from what the turtle will end up with: changes still waiting to be applied, else its current state
    const targetLabel = (turtle.pendingLabel ? turtle.pendingLabel.label : turtle.label) ?? "";
    const initial = turtle.pendingSeed ?? turtle.position;
    const initialCoords: Record<Coord, string> = {
        x: String(initial?.x ?? ""),
        y: String(initial?.y ?? ""),
        z: String(initial?.z ?? ""),
    };
    const initialHeading: Heading = isHeading(initial?.heading) ? initial.heading : "N";
    const initialWorld = initial?.world ?? null;
    const initialDimension = initial?.dimension ?? null;

    const [label, setLabel] = useState(targetLabel);
    const [coords, setCoords] = useState(initialCoords);
    const [heading, setHeading] = useState<Heading>(initialHeading);
    const [world, setWorld] = useState(placeOf(initialWorld));
    const [dimension, setDimension] = useState(placeOf(initialDimension));

    const places = useKnownPlaces();
    const worlds = [...places.keys()].filter((w) => w !== "");
    const dimensionsIn = (w: Place) => (w.kind === "new" ? [] : (places.get(placeName(w) ?? "") ?? []));

    function chooseWorld(next: Place) {
        setWorld(next);
        // Keep the dimension only if the new world has it too; a typed-in new dimension is kept as it is
        if (dimension.kind === "existing" && !dimensionsIn(next).includes(dimension.name)) setDimension(NONE);
    }

    const rename = useRenameTurtle(turtle.turtleId);
    const seed = useSeedTurtle(turtle.turtleId);

    const trimmedLabel = label.trim();
    const labelProblem = labelError(trimmedLabel);
    const labelChanged = trimmedLabel !== targetLabel;

    const parsed = COORDS.map((c) => Number(coords[c]));
    const coordsEmpty = COORDS.every((c) => coords[c].trim() === "");
    const coordsValid = COORDS.every((c) => coords[c].trim() !== "") && parsed.every(Number.isInteger);
    const positionChanged = COORDS.some((c) => coords[c] !== initialCoords[c])
        || heading !== initialHeading
        || placeName(world) !== initialWorld
        || placeName(dimension) !== initialDimension
        || !initial; // an unseeded turtle needs a first seed, even at the default heading
    // An unseeded turtle can be renamed without seeding it yet by leaving the coordinates empty
    const sendSeed = positionChanged && !(coordsEmpty && !initial);
    let coordsProblem: string | null = null;
    if (sendSeed) {
        coordsProblem = coordsValid ? placeError(world, "world") ?? placeError(dimension, "dimension")
            : "X, Y and Z must be whole numbers.";
    }

    const busy = rename.isPending || seed.isPending;
    const canSave = !labelProblem && !coordsProblem && (labelChanged || sendSeed) && !busy;
    const message = labelProblem
        ?? (rename.isError ? rename.error.message : null)
        ?? (seed.isError ? seed.error.message : null);

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (!canSave) return;
        const [x, y, z] = parsed as [number, number, number];
        try {
            await Promise.all([
                labelChanged && rename.mutateAsync(trimmedLabel || null),
                sendSeed && seed.mutateAsync({
                    x, y, z, heading,
                    world: placeName(world),
                    dimension: placeName(dimension),
                }),
            ]);
            onDone();
        } catch {
            // Shown from the mutation's error below; the form stays open so it can be retried
        }
    }

    return (
        <form className="seed-form" onSubmit={submit}>
            <label>
                <span className="muted small">Label</span>
                <input
                    type="text"
                    placeholder={`Turtle #${turtle.turtleId}`}
                    maxLength={MAX_LABEL_LENGTH}
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                />
            </label>

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

            <fieldset className="seed-heading">
                <legend className="muted small">Heading</legend>
                {HEADINGS.map((h) => (
                    <label key={h}>
                        <input
                            type="radio"
                            name={`heading-${turtle.turtleId}`}
                            value={h}
                            checked={heading === h}
                            onChange={() => setHeading(h)}
                        />
                        <span>{h}</span>
                    </label>
                ))}
            </fieldset>

            <div className="seed-place">
                <PlaceSelect label="World" what="world" options={worlds} value={world} onChange={chooseWorld}/>
                <PlaceSelect label="Dimension" what="dimension" options={dimensionsIn(world)} value={dimension}
                             onChange={setDimension}/>
            </div>

            <div className="seed-actions">
                <button type="submit" className="primary" disabled={!canSave}>
                    {busy ? "Saving…" : "Save"}
                </button>
                <button type="button" className="secondary" onClick={onDone} disabled={busy}>
                    Cancel
                </button>
            </div>

            {(message ?? coordsProblem) && (
                <p className="seed-error small" role="alert">
                    {message ?? coordsProblem}
                </p>
            )}
        </form>
    );
}
