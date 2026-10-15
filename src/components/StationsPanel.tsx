import {useId, useState} from "react";
import type {Station, TurtleStatus} from "../api/schemas";
import {useDeleteStation, useStations} from "../hooks/useStations";
import {stationsByDimension, stationSideLabel, stationsIn, stationTypeLabel} from "../lib/stations";
import {StationForm} from "./StationForm";

interface Props {
    /** The world the dashboard is showing; only its stations are listed. Null when no turtle has a world yet. */
    world: string | null;
    /** The selected turtle, whose position the add form can copy. */
    turtle: TurtleStatus | undefined;
}

const OPEN_KEY = "stations-open";

function storedOpen(): boolean {
    try {
        return localStorage.getItem(OPEN_KEY) !== "false";
    } catch {
        return true;
    }
}

/**
 * The stations in the shown world, where turtles refuel, drop items off and pick them up, by dimension, with a form to
 * add one. Collapsible, and whether it's open is remembered.
 */
export function StationsPanel({world, turtle}: Readonly<Props>) {
    const [open, setOpen] = useState(storedOpen);
    const [adding, setAdding] = useState(false);
    const bodyId = useId();
    const {data: stations = [], error, isPending} = useStations();
    const remove = useDeleteStation();

    const shown = stationsIn(stations, world);

    function toggle() {
        setOpen(!open);
        try {
            localStorage.setItem(OPEN_KEY, String(!open));
        } catch {
            // Not remembered; the panel still opens or closes.
        }
    }

    function add() {
        setOpen(true);
        setAdding(true);
    }

    function confirmRemove(station: Station) {
        if (confirm(`Remove the station “${station.name}”?`)) remove.mutate(station.stationId);
    }

    return (
        <section className="panel stations">
            <div className="collapse-header">
                <button type="button" className="collapse-toggle" aria-expanded={open} aria-controls={bodyId}
                        onClick={toggle}>
                    <span className="collapse-chevron" aria-hidden="true">▸</span>
                    <h2>
                        Stations <span className="muted">{shown.length}</span>
                    </h2>
                </button>
                {!adding && (
                    <button type="button" className="secondary section-action" onClick={add}>
                        Add
                    </button>
                )}
            </div>

            {open && (
                <div id={bodyId} className="collapse-body">
                    {adding && <StationForm world={world} turtle={turtle} onDone={() => setAdding(false)}/>}
                    <StationListBody
                        stations={shown}
                        isPending={isPending}
                        error={error}
                        removingId={remove.isPending ? remove.variables : null}
                        onRemove={confirmRemove}
                    />
                    {remove.isError && <p className="label-error small" role="alert">{remove.error.message}</p>}
                </div>
            )}
        </section>
    );
}

function StationListBody({stations, isPending, error, removingId, onRemove}: Readonly<{
    stations: Station[];
    isPending: boolean;
    error: Error | null;
    removingId: number | null;
    onRemove: (station: Station) => void;
}>) {
    if (error) return <p className="label-error small" role="alert">Couldn’t load stations: {error.message}</p>;
    if (isPending) return <p className="muted empty">Loading stations…</p>;
    if (stations.length === 0) {
        return <p className="muted empty">No stations in this world yet. Add one for turtles to refuel or unload
            at.</p>;
    }

    return stationsByDimension(stations).map(([dimension, members]) => (
        <div key={dimension} className="turtle-group">
            <h4 className="group-heading">
                {dimension} <span className="muted">{members.length}</span>
            </h4>
            <ul className="row-list">
                {members.map((s) => (
                    <li key={s.stationId} className="row station-row">
                        <span className={`station-badge ${s.type}`}>{stationTypeLabel(s.type)}</span>
                        <span className="row-main">
                            <span className="row-title">{s.name}</span>
                            <span className="row-sub muted">
                                <span className="mono">{s.x}, {s.y}, {s.z}</span>
                                {s.heading && ` facing ${s.heading}`}
                                {` · chest ${stationSideLabel(s.side).toLowerCase()}`}
                            </span>
                        </span>
                        <button
                            type="button"
                            className="icon-button"
                            aria-label={`Remove ${s.name}`}
                            title="Remove station"
                            disabled={removingId === s.stationId}
                            onClick={() => onRemove(s)}
                        >
                            ×
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    ));
}
