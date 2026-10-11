import {BASE_CAPABILITIES, type EquippedUpgrade, type TurtleStatus} from "../api/schemas";
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

/** What the turtle has equipped and, from that, which commands it can run. */
export function EquipmentSection({turtle}: Readonly<Props>) {
    const now = useNowSeconds();
    const equipment = turtle.equipment;

    return (
        <>
            <h3>Equipment</h3>
            {equipment ? (
                <>
                    <dl className="fields">
                        <dt>Left</dt>
                        <dd><UpgradeValue upgrade={equipment.left} itemsKnown={equipment.itemsKnown}/></dd>
                        <dt>Right</dt>
                        <dd><UpgradeValue upgrade={equipment.right} itemsKnown={equipment.itemsKnown}/></dd>
                        <dt>Reported</dt>
                        <dd title={formatTimestamp(equipment.ts)}>{formatAgo(equipment.ts, now)}</dd>
                    </dl>
                    {!equipment.itemsKnown && (
                        <p className="muted small">
                            This turtle’s CC: Tweaked can’t read equipped items, so only peripheral upgrades show up.
                        </p>
                    )}
                </>
            ) : (
                <p className="muted">{turtleName(turtle)} hasn’t reported its equipment yet.</p>
            )}

            <h3>Capabilities</h3>
            <ul className="capabilities" aria-label="What this turtle can do">
                {BASE_CAPABILITIES.map((c) => (
                    <li key={c} className="capability base" title="Every turtle can do this">{c}</li>
                ))}
                {equipment?.capabilities.map((c) => (
                    <li key={c} className="capability" title="From the turtle's equipment">{c}</li>
                ))}
            </ul>
            {/* Without itemsKnown an equipped tool doesn't show up, so the turtle may not be bare */}
            {equipment?.itemsKnown && equipment.capabilities.length === 0 && (
                <p className="muted small">No upgrades: equip a pickaxe to dig, or a modem, crafting table or
                    speaker.</p>
            )}
        </>
    );
}
