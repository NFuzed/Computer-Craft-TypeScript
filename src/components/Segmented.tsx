import type {CSSProperties} from "react";

interface Props<T extends string> {
    legend: string;
    /** Radio group name; unique on the page. */
    name: string;
    options: readonly { value: T; text: string }[];
    value: T;
    onChange: (value: T) => void;
}

/** A row of radios styled as segmented buttons, like the seed form's heading picker. */
export function Segmented<T extends string>({legend, name, options, value, onChange}: Readonly<Props<T>>) {
    return (
        <fieldset className="seed-heading" style={{"--options": options.length} as CSSProperties}>
            <legend className="muted small">{legend}</legend>
            {options.map((o) => (
                <label key={o.value}>
                    <input
                        type="radio"
                        name={name}
                        value={o.value}
                        checked={value === o.value}
                        onChange={() => onChange(o.value)}
                    />
                    <span>{o.text}</span>
                </label>
            ))}
        </fieldset>
    );
}
