import {useState} from "react";
import type {TurtleStatus} from "../api/schemas";
import {LabelPositionForm} from "./LabelPositionForm";
import {formatAgo, formatTimestamp} from "../lib/format";

interface Props {
    turtle: TurtleStatus;
    now: number;
}

/**
 * The turtle's label and reported position, with one Edit button that opens a form for both. A turtle normally
 * only needs seeding once, so the form starts open only for a turtle that has neither a position nor a pending
 * seed. Mount with `key={turtleId}` so the editing state resets per turtle.
 */
export function LabelPositionSection({turtle, now}: Readonly<Props>) {
    const pos = turtle.position;
    const pending = turtle.pendingSeed;
    const pendingLabel = turtle.pendingLabel;
    const [editing, setEditing] = useState(!pos && !pending);

    return (
        <>
            <div className="section-heading">
                <h3>Label &amp; position</h3>
                {!editing && (
                    <button type="button" className="secondary section-action" onClick={() => setEditing(true)}>
                        Edit
                    </button>
                )}
            </div>

            {pendingLabel && (
                <p className="seed-pending small">
                    Waiting for the turtle to{" "}
                    {pendingLabel.label == null ? "clear its label" : (
                        <>rename itself to <span className="mono">{pendingLabel.label}</span></>
                    )}{" "}
                    (sent {formatAgo(pendingLabel.ts, now)}).
                    {!turtle.online && " It will be picked up on the turtle's next heartbeat."}
                </p>
            )}
            {pending && (
                <p className="seed-pending small">
                    Waiting for the turtle to apply{" "}
                    <span className="mono">
                        {pending.x} / {pending.y} / {pending.z} {pending.heading}
                    </span>{" "}
                    (sent {formatAgo(pending.ts, now)}
                    {pending.source !== "dashboard" && ` by ${pending.source}`}).
                    {!turtle.online && " It will be picked up on the turtle's next heartbeat."}
                </p>
            )}

            {editing ? (
                <LabelPositionForm turtle={turtle} onDone={() => setEditing(false)}/>
            ) : (
                <>
                    <dl className="fields">
                        <dt>Label</dt>
                        <dd className={turtle.label ? undefined : "muted"}>{turtle.label || "none"}</dd>
                        {pos && (
                            <>
                                <dt>X / Y / Z</dt>
                                <dd className="mono">
                                    {pos.x} / {pos.y} / {pos.z}
                                </dd>
                                <dt>Heading</dt>
                                <dd>{pos.heading ?? "unknown"}</dd>
                                <dt>World</dt>
                                <dd>{pos.world ?? "—"}</dd>
                                <dt>Dimension</dt>
                                <dd>{pos.dimension ?? "—"}</dd>
                                <dt>Reported</dt>
                                <dd title={formatTimestamp(pos.ts)}>{formatAgo(pos.ts, now)}</dd>
                            </>
                        )}
                    </dl>
                    {!pos && !pending && (
                        <p className="muted">No position reported yet. Set one so the turtle can start moving.</p>
                    )}
                </>
            )}
        </>
    );
}
