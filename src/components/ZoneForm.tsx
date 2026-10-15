import {type FormEvent, useState} from "react";
import {MAX_ZONE_NAME_LENGTH, type Zone, ZONE_TYPES, type ZoneType} from "../api/schemas";
import {useUpdateZone} from "../hooks/useZones";
import {ZONE_TYPE_LABELS} from "../lib/zones";
import {Segmented} from "./Segmented";

interface Props {
    zone: Zone;
    /** Called when the zone is saved or the form is cancelled. */
    onDone: () => void;
}

const BOUNDS = ["minX", "maxX", "minZ", "maxZ", "minY", "maxY"] as const;
type Bound = (typeof BOUNDS)[number];

/** Y can be left blank: no limit that way. X and Z always need a value. */
const OPTIONAL: ReadonlySet<Bound> = new Set(["minY", "maxY"]);

const AXES = [
    {axis: "X", min: "minX", max: "maxX"},
    {axis: "Z", min: "minZ", max: "maxZ"},
    {axis: "Y", min: "minY", max: "maxY"},
] as const;

const TYPE_OPTIONS = ZONE_TYPES.map((t) => ({value: t, text: ZONE_TYPE_LABELS[t]}));

/** Why `name` can't be a zone name; the same rules as station names. */
function nameError(name: string): string | null {
    if (!name) return "Enter a name for the zone.";
    if (name.length > MAX_ZONE_NAME_LENGTH) return `At most ${MAX_ZONE_NAME_LENGTH} characters (${name.length}).`;
    if (/[^ -~]/.test(name)) return "Only printable ASCII characters are allowed.";
    return null;
}

/** A bound typed in: null when left blank, NaN when it isn't a whole number. */
function parseBound(text: string): number | null {
    if (text.trim() === "") return null;
    const n = Number(text);
    return Number.isInteger(n) ? n : Number.NaN;
}

function boundsError(values: Record<Bound, number | null>): string | null {
    for (const b of BOUNDS) {
        const v = values[b];
        if (Number.isNaN(v)) return "Bounds must be whole numbers.";
        if (v === null && !OPTIONAL.has(b)) return "X and Z need both a from and a to.";
    }
    for (const {axis, min, max} of AXES) {
        const lo = values[min], hi = values[max];
        if (lo !== null && hi !== null && lo > hi) return `${axis} from must not be more than ${axis} to.`;
    }
    return null;
}

/**
 * Edits a zone: its name, type and bounds. X and Z start from the area marked on the map; Y starts open both ways,
 * and a blank Y bound stays open.
 */
export function ZoneForm({zone, onDone}: Readonly<Props>) {
    const [name, setName] = useState(zone.name);
    const [type, setType] = useState<ZoneType>(zone.type as ZoneType);
    const [text, setText] = useState<Record<Bound, string>>(() => {
        const entries = BOUNDS.map((b) => [b, zone[b] == null ? "" : String(zone[b])]);
        return Object.fromEntries(entries) as Record<Bound, string>;
    });

    const update = useUpdateZone();

    const trimmed = name.trim();
    const values = Object.fromEntries(BOUNDS.map((b) => [b, parseBound(text[b])])) as Record<Bound, number | null>;
    const problem = nameError(trimmed) ?? boundsError(values);
    const canSave = !problem && !update.isPending;
    const message = update.isError ? update.error.message : problem;

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (!canSave) return;
        try {
            await update.mutateAsync({
                zoneId: zone.zoneId,
                zone: {
                    name: trimmed,
                    type,
                    minX: values.minX!,
                    maxX: values.maxX!,
                    minZ: values.minZ!,
                    maxZ: values.maxZ!,
                    minY: values.minY,
                    maxY: values.maxY,
                    world: zone.world,
                    dimension: zone.dimension,
                },
            });
            onDone();
        } catch {
            // Shown from the mutation's error below; the form stays open so it can be fixed
        }
    }

    function setBound(bound: Bound, value: string) {
        setText((prev) => ({...prev, [bound]: value}));
    }

    return (
        <form className="seed-form zone-form" onSubmit={submit}>
            <label>
                <span className="muted small">Name</span>
                <input type="text" maxLength={MAX_ZONE_NAME_LENGTH} value={name}
                       onChange={(e) => setName(e.target.value)} autoFocus/>
            </label>

            <Segmented legend="Type" name={`zone-type-${zone.zoneId}`} options={TYPE_OPTIONS} value={type}
                       onChange={setType}/>

            <div className="zone-bounds">
                {AXES.map((a) => (
                    <ZoneAxisInputs key={a.axis} {...a} text={text} onChange={setBound}/>
                ))}
            </div>
            <p className="muted small">From and to are both included. Leave a Y bound blank for no limit that way.</p>

            <div className="seed-actions">
                <button type="submit" className="primary" disabled={!canSave}>
                    {update.isPending ? "Saving…" : "Save"}
                </button>
                <button type="button" className="secondary" onClick={onDone} disabled={update.isPending}>
                    Cancel
                </button>
            </div>

            {message && <p className="seed-error small" role="alert">{message}</p>}
        </form>
    );
}

/** One axis's from and to boxes, side by side under the axis's name. */
function ZoneAxisInputs({axis, min, max, text, onChange}: Readonly<{
    axis: string;
    min: Bound;
    max: Bound;
    text: Record<Bound, string>;
    onChange: (bound: Bound, value: string) => void;
}>) {
    const bounds = [{bound: min, end: "from"}, {bound: max, end: "to"}] as const;
    return (
        <fieldset className="zone-axis">
            <legend className="muted small zone-axis-name">{axis}</legend>
            <div className="zone-axis-inputs">
                {bounds.map(({bound, end}) => (
                    <label key={bound}>
                        <span className="visually-hidden">{`${axis} ${end}`}</span>
                        <input
                            type="number"
                            step={1}
                            value={text[bound]}
                            placeholder={OPTIONAL.has(bound) ? "no limit" : undefined}
                            onChange={(e) => onChange(bound, e.target.value)}
                        />
                    </label>
                ))}
            </div>
        </fieldset>
    );
}
