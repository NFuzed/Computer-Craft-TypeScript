import type {TurtleStatus} from "../api/schemas";
import {groupBy, turtleDimension} from "../lib/fleet";
import {formatAgo, turtleColor, turtleName, useNowSeconds} from "../lib/format";

interface Props {
    /** The turtles in the chosen world, plus any that were never seeded. */
    turtles: TurtleStatus[];
    selectedId: number | null;
    onSelect: (id: number) => void;
}

/** The turtles grouped by dimension, busiest first. Turtles that were never seeded come last. */
export function TurtleList({turtles, selectedId, onSelect}: Readonly<Props>) {
    const now = useNowSeconds();
    const onlineCount = turtles.filter((t) => t.online).length;
    const groups = groupBy(turtles, turtleDimension);
    const unseeded = turtles.filter((t) => turtleDimension(t) === undefined);
    if (unseeded.length > 0) groups.push(["not seeded", unseeded]);

    return (
        <section className="panel turtle-list">
            <h2>
                Turtles <span className="muted">{onlineCount}/{turtles.length} online</span>
            </h2>
            {turtles.length === 0 ? (
                <p className="muted empty">No turtles have reported in yet.</p>
            ) : (
                groups.map(([dimension, members]) => (
                    <div key={dimension} className="turtle-group">
                        <h4 className="group-heading">
                            {dimension} <span className="muted">{members.length}</span>
                        </h4>
                        <ul className="row-list">
                            {members.map((t) => (
                                <li key={t.turtleId}>
                                    <button
                                        type="button"
                                        className={t.turtleId === selectedId ? "row selected" : "row"}
                                        onClick={() => onSelect(t.turtleId)}
                                    >
                                        <span className="swatch" style={{background: turtleColor(t.turtleId)}}/>
                                        <span className="row-main">
                                            <span className="row-title">{turtleName(t)}</span>
                                            <span className="row-sub muted">
                                                {t.position
                                                    ? `${t.position.x}, ${t.position.y}, ${t.position.z}`
                                                    : "no position"}
                                                {t.pendingSeed && " · seed pending"}
                                                {t.pendingLabel && " · rename pending"}
                                            </span>
                                        </span>
                                        <span className="row-meta">
                                            <span className={t.online ? "status online" : "status offline"}>
                                                {t.online ? "online" : "offline"}
                                            </span>
                                            <span className="muted small">{formatAgo(t.lastSeen, now)}</span>
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))
            )}
        </section>
    );
}
