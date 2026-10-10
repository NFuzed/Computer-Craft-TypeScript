import {type FormEvent, useState} from "react";
import {MAX_LABEL_LENGTH, type TurtleStatus} from "../api/schemas";
import {useRenameTurtle} from "../hooks/useTurtles";

interface Props {
    turtle: TurtleStatus;
}

/** Returns why `label` can't be used, mirroring the server's labelError so we can flag it before sending. */
function labelError(label: string): string | null {
    if (label.length > MAX_LABEL_LENGTH) return `At most ${MAX_LABEL_LENGTH} characters (${label.length}).`;
    // ComputerCraft drops other characters, so the rename would never be acknowledged
    if (/[^ -~]/.test(label)) return "Only printable ASCII characters are allowed.";
    return null;
}

/**
 * Renames a turtle. The turtle sets its own label on its next heartbeat; an empty label clears it.
 * Mount with `key={turtleId}` so it resets per turtle.
 */
export function LabelForm({turtle}: Readonly<Props>) {
    // The label the turtle will end up with: a rename still waiting to be applied, else its current label
    const target = turtle.pendingLabel ? turtle.pendingLabel.label : turtle.label;
    const [label, setLabel] = useState(target ?? "");

    const rename = useRenameTurtle(turtle.turtleId);

    const trimmed = label.trim();
    const error = labelError(trimmed);
    const unchanged = trimmed === (target ?? "");
    const message = error ?? (rename.isError ? rename.error.message : null);

    function submit(e: FormEvent) {
        e.preventDefault();
        if (error || unchanged) return;
        rename.mutate(trimmed || null);
    }

    let renameActionNames = trimmed ? "Rename" : "Clear";
    return (
        <form className="label-form" onSubmit={submit}>
            <input
                type="text"
                aria-label="Label"
                placeholder={`Turtle #${turtle.turtleId}`}
                maxLength={MAX_LABEL_LENGTH}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
            />
            <button type="submit" className="primary" disabled={!!error || unchanged || rename.isPending}>
                {rename.isPending ? "Saving…" : renameActionNames}
            </button>

            {message && (
                <p className="label-error small" role="alert">
                    {message}
                </p>
            )}
        </form>
    );
}
