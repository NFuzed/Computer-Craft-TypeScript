import {useState} from "react";
import type {EquippedUpgrade, TurtleStatus} from "../api/schemas";
import {EquipmentForm} from "./EquipmentForm";
import {formatAgo, formatTimestamp, itemDisplayName, turtleName, useNowSeconds} from "../lib/format";

interface Props {
    turtle: TurtleStatus;
}

/** One side of the turtle: the item's name and its peripheral types, "empty", or "unknown" on older CC: Tweaked. */
function UpgradeValue({upgrade, itemsKnown}: Readonly<{ upgrade: EquippedUpgrade | null; itemsKnown: boolean }>) {
    if (!upgrade) {
        // Without getEquippedLeft/Right a tool doesn't show up, so an empty side may not be empty
        return <span className="muted">{itemsKnown ? "empty" : "empty or a tool"}</span>;
    }
    const types = upgrade.peripheralTypes.join(", ");
    if (!upgrade.item) return <span className="mono">{types}</span>;
    return (
        <span title={upgrade.item}>
            {itemDisplayName(upgrade.item)}
            {types && <span className="muted mono"> ({types})</span>}
        </span>
    );
}

/** The equipment on each side and when it was reported or seeded, or that the turtle hasn't reported it yet. */
function EquipmentFields({turtle}: Readonly<Props>) {
    const now = useNowSeconds();
    const equipment = turtle.equipment;
    if (!equipment) return <p className="muted">{turtleName(turtle)} hasn’t reported its equipment yet.</p>;

    return (
        <>
            <dl className="fields">
                <dt>Left</dt>
                <dd><UpgradeValue upgrade={equipment.left} itemsKnown={equipment.itemsKnown}/></dd>
                <dt>Right</dt>
                <dd><UpgradeValue upgrade={equipment.right} itemsKnown={equipment.itemsKnown}/></dd>
                <dt>{equipment.seeded ? "Seeded" : "Reported"}</dt>
                <dd title={formatTimestamp(equipment.ts)}>{formatAgo(equipment.ts, now)}</dd>
            </dl>
            {!equipment.itemsKnown && (
                <p className="muted small">
                    This turtle’s CC: Tweaked can’t read equipped items, so only peripheral upgrades show up.
                    Seed its tools to unlock Dig and Attack.
                </p>
            )}
        </>
    );
}

/**
 * What the turtle has equipped, with a Seed button that opens a form to set it by hand. Mount with `key={turtleId}`
 * so the editing state resets per turtle.
 */
export function EquipmentSection({turtle}: Readonly<Props>) {
    const [editing, setEditing] = useState(false);

    return (
        <>
            <div className="section-heading">
                <h3>Equipment</h3>
                {!editing && (
                    <button type="button" className="secondary section-action" onClick={() => setEditing(true)}>
                        Seed
                    </button>
                )}
            </div>

            {editing
                ? <EquipmentForm turtle={turtle} onDone={() => setEditing(false)}/>
                : <EquipmentFields turtle={turtle}/>}
        </>
    );
}
