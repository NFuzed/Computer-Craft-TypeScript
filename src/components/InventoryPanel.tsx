import {useState} from "react";
import {INVENTORY_SIZE, type InventorySlot, type TurtleStatus} from "../api/schemas";
import {useInventory} from "../hooks/useInventory";
import {RefuelForm} from "./RefuelForm";
import {
    formatAgo,
    formatTimestamp,
    itemAbbreviation,
    itemColor,
    itemDisplayName,
    turtleName,
    useNowSeconds
} from "../lib/format";

interface Props {
    turtle: TurtleStatus | undefined;
}

const SLOT_NUMBERS = Array.from({length: INVENTORY_SIZE}, (_, i) => i + 1);

/** "Lead ×2" */
function itemSummary(item: InventorySlot): string {
    return `${itemDisplayName(item.name)} ×${item.count}`;
}

/** Spoken label for a slot button, e.g. "Slot 1: Lead ×2". */
function slotLabel(slot: number, item: InventorySlot | undefined): string {
    return `Slot ${slot}: ${item ? itemSummary(item) : "empty"}`;
}

/** Tooltip for a slot button: the item and its id, or that the slot is empty. */
function slotTitle(slot: number, item: InventorySlot | undefined): string {
    return item ? `${itemSummary(item)}\n${item.name}` : `Slot ${slot} (empty)`;
}

/** The selected turtle's 16 slots, laid out like the turtle's own inventory GUI. Clicking a slot selects it. */
export function InventoryPanel({turtle}: Readonly<Props>) {
    if (!turtle) {
        return (
            <section className="panel inventory-panel">
                <h2>Inventory</h2>
                <p className="muted empty">Select a turtle to see its inventory.</p>
            </section>
        );
    }
    return <TurtleInventory key={turtle.turtleId} turtle={turtle}/>;
}

function TurtleInventory({turtle}: Readonly<{ turtle: TurtleStatus }>) {
    const now = useNowSeconds();
    const {
        data: inventory,
        error,
        isPending,
        pendingSlot,
        select,
        refuel,
        refuelPending,
        refuelResult,
        refuelTimedOut,
    } = useInventory(turtle.turtleId, {online: turtle.online});
    const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);

    const bySlot = new Map<number, InventorySlot>(inventory?.slots.map((s) => [s.slot, s]));
    const selectedSlot = inventory?.selectedSlot ?? null;
    const shownSlot = hoveredSlot ?? pendingSlot ?? selectedSlot;
    const shownItem = shownSlot == null ? undefined : bySlot.get(shownSlot);
    const canSelect = turtle.online && inventory != null;

    let body;
    if (isPending) {
        body = <p className="muted">Loading inventory…</p>;
    } else if (error) {
        body = <p className="label-error small" role="alert">Couldn’t load the inventory: {error.message}</p>;
    } else if (!inventory) {
        body = <p className="muted">{turtleName(turtle)} hasn’t reported its inventory yet.</p>;
    } else {
        body = (
            <>
                {/* disabled on the fieldset disables every slot button in it */}
                <fieldset className="inventory-grid" disabled={!canSelect}>
                    <legend className="visually-hidden">{turtleName(turtle)} inventory</legend>
                    {SLOT_NUMBERS.map((slot) => {
                        const item = bySlot.get(slot);
                        const classes = ["inventory-slot"];
                        if (slot === selectedSlot) classes.push("selected");
                        if (slot === pendingSlot) classes.push("pending");
                        return (
                            <button
                                key={slot}
                                type="button"
                                className={classes.join(" ")}
                                aria-pressed={slot === selectedSlot}
                                aria-label={slotLabel(slot, item)}
                                title={slotTitle(slot, item)}
                                onClick={() => slot !== selectedSlot && select.mutate(slot)}
                                onMouseEnter={() => setHoveredSlot(slot)}
                                onMouseLeave={() => setHoveredSlot(null)}
                                onFocus={() => setHoveredSlot(slot)}
                                onBlur={() => setHoveredSlot(null)}
                            >
                                {item && (
                                    <>
                                        <span className="item-icon" style={{background: itemColor(item.name)}}>
                                            {itemAbbreviation(item.name)}
                                        </span>
                                        {item.count > 1 && <span className="item-count">{item.count}</span>}
                                    </>
                                )}
                            </button>
                        );
                    })}
                </fieldset>

                <p className="inventory-info small">
                    <span className="muted">Slot {shownSlot}:</span>{" "}
                    {shownItem ? (
                        <>
                            {itemSummary(shownItem)}{" "}
                            <span className="muted mono">{shownItem.name}</span>
                        </>
                    ) : (
                        <span className="muted">empty</span>
                    )}
                </p>

                {pendingSlot != null && (
                    <p className="seed-pending small">Waiting for the turtle to select slot {pendingSlot}…</p>
                )}
                {select.isError && (
                    <p className="label-error small" role="alert">{select.error.message}</p>
                )}
                {!turtle.online && (
                    <p className="muted small">Offline: slots can be selected and the turtle refuelled once it
                        reconnects.</p>
                )}

                <RefuelForm
                    inventory={inventory}
                    online={turtle.online}
                    onRefuel={(count) => refuel.mutate(count)}
                    pending={refuelPending}
                    result={refuelResult}
                    timedOut={refuelTimedOut}
                    error={refuel.error}
                />
            </>
        );
    }

    return (
        <section className="panel inventory-panel">
            <header className="inventory-header">
                <h2>Inventory</h2>
                {inventory && (
                    <span className="muted small" title={formatTimestamp(inventory.ts)}>
                        reported {formatAgo(inventory.ts, now)}
                    </span>
                )}
            </header>
            {body}
        </section>
    );
}
