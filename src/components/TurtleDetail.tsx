import type {TurtleStatus} from "../api/schemas";
import {CommandPad} from "./CommandPad";
import {EquipmentSection} from "./EquipmentSection";
import {LabelForm} from "./LabelForm";
import {SeedForm} from "./SeedForm";
import {formatAgo, formatTimestamp, turtleColor, turtleName, useNowSeconds} from "../lib/format";

interface Props {
    turtle: TurtleStatus | undefined;
    onClose: () => void;
}

export function TurtleDetail({turtle, onClose}: Readonly<Props>) {
    const now = useNowSeconds();

    if (!turtle) {
        return (
            <section className="panel turtle-detail">
                <p className="muted empty">Select a turtle to see its details.</p>
            </section>
        );
    }

    const pos = turtle.position;
    const pending = turtle.pendingSeed;
    const pendingLabel = turtle.pendingLabel;

    return (
        <section className="panel turtle-detail">
            <header className="detail-header">
                <span className="swatch large" style={{background: turtleColor(turtle.turtleId)}}/>
                <div>
                    <h2>{turtleName(turtle)}</h2>
                    <span className="muted">ID {turtle.turtleId}</span>
                </div>
                <button type="button" className="icon-button" onClick={onClose} aria-label="Close details">
                    ×
                </button>
            </header>

            <dl className="fields">
                <dt>Status</dt>
                <dd>
                    <span
                        className={turtle.online ? "status online" : "status offline"}>{turtle.online ? "online" : "offline"}</span>
                </dd>
                <dt>Last seen</dt>
                <dd title={formatTimestamp(turtle.lastSeen)}>{formatAgo(turtle.lastSeen, now)}</dd>
            </dl>

            <h3>Label</h3>
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
            <LabelForm key={`label-${turtle.turtleId}`} turtle={turtle}/>

            <h3>Position</h3>
            {pos ? (
                <dl className="fields">
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
                </dl>
            ) : (
                <p className="muted">No position reported yet. Seed one below so the turtle can start moving.</p>
            )}

            <h3>Seed position</h3>
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
            <SeedForm key={`seed-${turtle.turtleId}`} turtle={turtle}/>

            <EquipmentSection turtle={turtle}/>

            <h3>Commands</h3>
            <CommandPad key={`commands-${turtle.turtleId}`} turtle={turtle}/>
        </section>
    );
}
