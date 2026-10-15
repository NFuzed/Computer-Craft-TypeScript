/** A world or dimension picked from a dropdown: none, one already recorded, or a new one typed in. */
export type Place = { kind: "none" } | { kind: "existing"; name: string } | { kind: "new"; name: string };

export const NONE: Place = {kind: "none"};

export function placeOf(name: string | null | undefined): Place {
    return name ? {kind: "existing", name} : NONE;
}

/** The name to send, or null for none. A new name is trimmed; blank is caught by placeError. */
export function placeName(place: Place): string | null {
    return place.kind === "none" ? null : place.name.trim() || null;
}

export function placeError(place: Place, what: string): string | null {
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
export function PlaceSelect({label, what, options, value, onChange}: Readonly<PlaceSelectProps>) {
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
