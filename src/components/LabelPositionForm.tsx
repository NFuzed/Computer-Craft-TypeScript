import {type FormEvent, useState} from "react";
import {type Heading, HEADINGS, MAX_LABEL_LENGTH, type TurtleStatus} from "../api/schemas";
import {useRenameTurtle, useSeedTurtle} from "../hooks/useTurtles";

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
    const initialDimension = initial?.dimension ?? "";

    const [label, setLabel] = useState(targetLabel);
    const [coords, setCoords] = useState(initialCoords);
    const [heading, setHeading] = useState<Heading>(initialHeading);
    const [dimension, setDimension] = useState(initialDimension);

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
        || dimension.trim() !== initialDimension
        || !initial; // an unseeded turtle needs a first seed, even at the default heading
    // An unseeded turtle can be renamed without seeding it yet by leaving the coordinates empty
    const sendSeed = positionChanged && !(coordsEmpty && !initial);
    const coordsProblem = sendSeed && !coordsValid ? "X, Y and Z must be whole numbers." : null;

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
                    world: turtle.position?.world ?? null,
                    dimension: dimension.trim() || null,
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

            <label className="seed-dimension">
                <span className="muted small">Dimension (optional)</span>
                <input type="text" placeholder="overworld" value={dimension}
                       onChange={(e) => setDimension(e.target.value)}/>
            </label>

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
