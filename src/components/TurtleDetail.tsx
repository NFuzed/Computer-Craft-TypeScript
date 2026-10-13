import type {TurtleStatus} from "../api/schemas";
import {CommandPad} from "./CommandPad";
import {EquipmentSection} from "./EquipmentSection";
import {LabelPositionSection} from "./LabelPositionSection";
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

            <LabelPositionSection key={`label-position-${turtle.turtleId}`} turtle={turtle} now={now}/>

            <EquipmentSection key={`equipment-${turtle.turtleId}`} turtle={turtle}/>

            <h3>Commands</h3>
            <CommandPad key={`commands-${turtle.turtleId}`} turtle={turtle}/>
        </section>
    );
}
