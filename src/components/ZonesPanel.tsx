import {useId, useState} from "react";
import type {Zone} from "../api/schemas";
import {useDeleteZone, useZones} from "../hooks/useZones";
import {areaCornersText, areaSizeText, yRangeText, zonesByDimension, zonesIn, zoneTypeLabel} from "../lib/zones";
import {ZoneForm} from "./ZoneForm";

interface Props {
    /** The world the dashboard is showing; only its zones are listed. Null when no turtle has a world yet. */
    world: string | null;
}

const OPEN_KEY = "zones-open";

function storedOpen(): boolean {
    try {
        return localStorage.getItem(OPEN_KEY) !== "false";
    } catch {
        return true;
    }
}

/**
 * The no-dig zones and quarries in the shown world, by dimension. They're made by right-dragging on the map; here
 * they're renamed, retyped, resized and given Y limits. Collapsible like Stations, and whether it's open is remembered.
 */
export function ZonesPanel({world}: Readonly<Props>) {
    const [open, setOpen] = useState(storedOpen);
    const [editingId, setEditingId] = useState<number | null>(null);
    const bodyId = useId();
    const {data: zones = [], error, isPending} = useZones();
    const remove = useDeleteZone();

    const shown = zonesIn(zones, world);

    function toggle() {
        setOpen(!open);
        try {
            localStorage.setItem(OPEN_KEY, String(!open));
        } catch {
            // Not remembered; the panel still opens or closes.
        }
    }

    function confirmRemove(zone: Zone) {
        if (confirm(`Remove the zone “${zone.name}”?`)) remove.mutate(zone.zoneId);
    }

    return (
        <section className="panel zones">
            <div className="collapse-header">
                <button type="button" className="collapse-toggle" aria-expanded={open} aria-controls={bodyId}
                        onClick={toggle}>
                    <span className="collapse-chevron" aria-hidden="true">▸</span>
                    <h2>
                        Zones <span className="muted">{shown.length}</span>
                    </h2>
                </button>
            </div>

            {open && (
                <div id={bodyId} className="collapse-body">
                    <ZoneListBody
                        zones={shown}
                        isPending={isPending}
                        error={error}
                        editingId={editingId}
                        removingId={remove.isPending ? remove.variables : null}
                        onEdit={setEditingId}
                        onRemove={confirmRemove}
                    />
                    {remove.isError && <p className="label-error small" role="alert">{remove.error.message}</p>}
                </div>
            )}
        </section>
    );
}

function ZoneListBody({zones, isPending, error, editingId, removingId, onEdit, onRemove}: Readonly<{
    zones: Zone[];
    isPending: boolean;
    error: Error | null;
    editingId: number | null;
    removingId: number | null;
    onEdit: (zoneId: number | null) => void;
    onRemove: (zone: Zone) => void;
}>) {
    if (error) return <p className="label-error small" role="alert">Couldn’t load zones: {error.message}</p>;
    if (isPending) return <p className="muted empty">Loading zones…</p>;
    if (zones.length === 0) {
        return <p className="muted empty">No zones in this world yet. Right-drag on the top-down map to mark one.</p>;
    }

    return zonesByDimension(zones).map(([dimension, members]) => (
        <div key={dimension} className="turtle-group">
            <h4 className="group-heading">
                {dimension} <span className="muted">{members.length}</span>
            </h4>
            <ul className="row-list">
                {members.map((z) => (
                    <li key={z.zoneId} className="zone-item">
                        <div className="row station-row">
                            <span className={`station-badge zone-badge ${z.type}`}>{zoneTypeLabel(z.type)}</span>
                            <span className="row-main">
                                <span className="row-title">{z.name}</span>
                                <span className="row-sub muted">
                                    <span className="mono">{areaCornersText(z)}</span>
                                    {` · ${areaSizeText(z)} · ${yRangeText(z)}`}
                                </span>
                            </span>
                            <button
                                type="button"
                                className="icon-button"
                                aria-label={`Edit ${z.name}`}
                                aria-expanded={editingId === z.zoneId}
                                title="Edit zone"
                                onClick={() => onEdit(editingId === z.zoneId ? null : z.zoneId)}
                            >
                                ✎
                            </button>
                            <button
                                type="button"
                                className="icon-button"
                                aria-label={`Remove ${z.name}`}
                                title="Remove zone"
                                disabled={removingId === z.zoneId}
                                onClick={() => onRemove(z)}
                            >
                                ×
                            </button>
                        </div>
                        {editingId === z.zoneId && <ZoneForm zone={z} onDone={() => onEdit(null)}/>}
                    </li>
                ))}
            </ul>
        </div>
    ));
}
