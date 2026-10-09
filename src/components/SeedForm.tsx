import {type FormEvent, useState} from "react";
import {type Heading, HEADINGS, type TurtleStatus} from "../api/schemas";
import {useSeedTurtle} from "../hooks/useTurtles";

interface Props {
    turtle: TurtleStatus;
}

const COORDS = ["x", "y", "z"] as const;
type Coord = (typeof COORDS)[number];

function isHeading(h: string | null | undefined): h is Heading {
    return (HEADINGS as readonly string[]).includes(h ?? "");
}

/**
 * Sets a turtle's position and heading. Turtles have no GPS, so this is the starting point for their dead
 * reckoning; seeding again corrects a drifted position. Mount with `key={turtleId}` so it resets per turtle.
 */
export function SeedForm({turtle}: Readonly<Props>) {
    // Start from the seed still waiting to be applied, else the last reported position
    const initial = turtle.pendingSeed ?? turtle.position;
    const [coords, setCoords] = useState<Record<Coord, string>>({
        x: String(initial?.x ?? ""),
        y: String(initial?.y ?? ""),
        z: String(initial?.z ?? ""),
    });
    const [heading, setHeading] = useState<Heading>(isHeading(initial?.heading) ? initial.heading : "N");
    const [dimension, setDimension] = useState(initial?.dimension ?? "");

    const seed = useSeedTurtle(turtle.turtleId);

    const parsed = COORDS.map((c) => Number(coords[c]));
    const valid = COORDS.every((c) => coords[c].trim() !== "") && parsed.every(Number.isInteger);

    function submit(e: FormEvent) {
        e.preventDefault();
        if (!valid) return;
        const [x, y, z] = parsed as [number, number, number];
        seed.mutate({x, y, z, heading, world: turtle.position?.world ?? null, dimension: dimension.trim() || null});
    }

    return (
        <form className="seed-form" onSubmit={submit}>
            <div className="seed-coords">
                {COORDS.map((c) => (
                    <label key={c}>
                        <span className="muted small">{c.toUpperCase()}</span>
                        <input
                            type="number"
                            step={1}
                            required
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

            <button type="submit" className="primary" disabled={!valid || seed.isPending}>
                {seed.isPending ? "Seeding…" : "Seed position"}
            </button>

            {seed.isError && (
                <p className="seed-error small" role="alert">
                    {seed.error.message}
                </p>
            )}
        </form>
    );
}
