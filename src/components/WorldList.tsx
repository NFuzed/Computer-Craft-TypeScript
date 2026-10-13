import type {TurtleStatus} from "../api/schemas";
import {groupBy, NO_WORLD, turtleDimension, worldName} from "../lib/fleet";

interface Props {
    /** Each world with the turtles in it, busiest first. */
    worlds: [string, TurtleStatus[]][];
    selected: string | null;
    onSelect: (world: string) => void;
}

/** The worlds turtles are in. Choosing one limits the turtle list and the map to it. */
export function WorldList({worlds, selected, onSelect}: Readonly<Props>) {
    return (
        <section className="panel world-list">
            <h2>
                Worlds <span className="muted">{worlds.length}</span>
            </h2>
            {worlds.length === 0 ? (
                <p className="muted empty">No turtle has been given a position yet.</p>
            ) : (
                <ul className="row-list">
                    {worlds.map(([world, turtles]) => {
                        const online = turtles.filter((t) => t.online).length;
                        const dimensions = groupBy(turtles, turtleDimension).map(([d]) => d);
                        return (
                            <li key={world}>
                                <button
                                    type="button"
                                    className={world === selected ? "row selected" : "row"}
                                    aria-pressed={world === selected}
                                    onClick={() => onSelect(world)}
                                >
                                    <span className="row-main">
                                        <span className={world === NO_WORLD ? "row-title muted" : "row-title"}>
                                            {worldName(world)}
                                        </span>
                                        <span className="row-sub muted">{dimensions.join(", ")}</span>
                                    </span>
                                    <span className="row-meta">
                                        <span className="small">
                                            {turtles.length === 1 ? "1 turtle" : `${turtles.length} turtles`}
                                        </span>
                                        <span className="muted small">{online} online</span>
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
