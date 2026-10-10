import type {TurtleStatus} from "../api/schemas";
import {formatAgo, turtleColor, turtleName, useNowSeconds} from "../lib/format";

interface Props {
    turtles: TurtleStatus[];
    selectedId: number | null;
    onSelect: (id: number) => void;
}

export function TurtleList({turtles, selectedId, onSelect}: Readonly<Props>) {
    const now = useNowSeconds();
    const onlineCount = turtles.filter((t) => t.online).length;

    return (
        <section className="panel turtle-list">
            <h2>
                Turtles <span className="muted">{onlineCount}/{turtles.length} online</span>
            </h2>
            {turtles.length === 0 ? (
                <p className="muted empty">No turtles have reported in yet.</p>
            ) : (
                <ul>
                    {turtles.map((t) => (
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
                    {t.position ? `${t.position.x}, ${t.position.y}, ${t.position.z}` : "no position"}
                      {t.pendingSeed && " · seed pending"}
                      {t.pendingLabel && " · rename pending"}
                  </span>
                </span>
                                <span className="row-meta">
                  <span
                      className={t.online ? "status online" : "status offline"}>{t.online ? "online" : "offline"}</span>
                  <span className="muted small">{formatAgo(t.lastSeen, now)}</span>
                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
