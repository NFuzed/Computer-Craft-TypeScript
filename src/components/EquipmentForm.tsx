import {type FormEvent, useState} from "react";
import type {EquippedUpgrade, TurtleStatus} from "../api/schemas";
import {useSeedEquipment} from "../hooks/useTurtles";
import {itemDisplayName} from "../lib/format";

interface Props {
    turtle: TurtleStatus;
    /** Called when the equipment is saved or the edit is cancelled. */
    onDone: () => void;
}

/** The upgrades CC: Tweaked turtles can equip out of the box, with the peripheral types they show up as. */
const UPGRADES: EquippedUpgrade[] = [
    {item: "minecraft:diamond_pickaxe", peripheralTypes: []},
    {item: "minecraft:diamond_shovel", peripheralTypes: []},
    {item: "minecraft:diamond_axe", peripheralTypes: []},
    {item: "minecraft:diamond_hoe", peripheralTypes: []},
    {item: "minecraft:diamond_sword", peripheralTypes: []},
    {item: "minecraft:crafting_table", peripheralTypes: ["workbench"]},
    {item: "computercraft:wireless_modem_normal", peripheralTypes: ["modem"]},
    {item: "computercraft:wireless_modem_advanced", peripheralTypes: ["modem"]},
    {item: "computercraft:speaker", peripheralTypes: ["speaker"]},
];

/** What one side holds in the form: nothing, an upgrade from the list (or the one it has now), or a typed item id. */
type Side = { kind: "empty" } | { kind: "upgrade"; upgrade: EquippedUpgrade } | { kind: "other"; item: string };

const EMPTY: Side = {kind: "empty"};

function sideOf(upgrade: EquippedUpgrade | null | undefined): Side {
    return upgrade ? {kind: "upgrade", upgrade} : EMPTY;
}

/** Tells upgrades apart in the dropdown; a peripheral reported without an item goes by its types. */
function upgradeKey(upgrade: EquippedUpgrade): string {
    return upgrade.item ?? `peripheral:${upgrade.peripheralTypes.join(",")}`;
}

function upgradeName(upgrade: EquippedUpgrade): string {
    return upgrade.item ? itemDisplayName(upgrade.item) : upgrade.peripheralTypes.join(", ");
}

/** The upgrade to send, or null for an empty side. A typed item id is trimmed; blank is caught by sideError. */
function sideUpgrade(side: Side): EquippedUpgrade | null {
    if (side.kind === "empty") return null;
    if (side.kind === "upgrade") return side.upgrade;
    return {item: side.item.trim(), peripheralTypes: []};
}

function sideError(side: Side, name: string): string | null {
    return side.kind === "other" && !side.item.trim() ? `Enter an item id for the ${name} side.` : null;
}

function sameUpgrade(a: EquippedUpgrade | null, b: EquippedUpgrade | null): boolean {
    return (a == null || b == null) ? a === b : upgradeKey(a) === upgradeKey(b);
}

interface SideSelectProps {
    label: string;
    /** The upgrade the turtle has on this side now, listed even if it isn't a standard one. */
    current: EquippedUpgrade | null;
    value: Side;
    onChange: (side: Side) => void;
}

/** A dropdown of the standard upgrades plus "Empty" and "Other item…", which shows a box for the item id. */
function SideSelect({label, current, value, onChange}: Readonly<SideSelectProps>) {
    const upgrades = current && !UPGRADES.some((u) => sameUpgrade(u, current)) ? [current, ...UPGRADES] : UPGRADES;
    const selected = value.kind === "upgrade" ? `=${upgradeKey(value.upgrade)}` : value.kind;

    function choose(v: string) {
        if (v === "empty") onChange(EMPTY);
        else if (v === "other") onChange({kind: "other", item: ""});
        else onChange(sideOf(upgrades.find((u) => `=${upgradeKey(u)}` === v)));
    }

    return (
        <label>
            <span className="muted small">{label}</span>
            <select className="select" value={selected} onChange={(e) => choose(e.target.value)}>
                <option value="empty">Empty</option>
                {upgrades.map((u) => (
                    <option key={upgradeKey(u)} value={`=${upgradeKey(u)}`} title={u.item ?? undefined}>
                        {upgradeName(u)}
                    </option>
                ))}
                <option value="other">Other item…</option>
            </select>
            {value.kind === "other" && (
                <input
                    type="text"
                    placeholder="e.g. minecraft:netherite_pickaxe"
                    aria-label={`${label} item id`}
                    value={value.item}
                    onChange={(e) => onChange({kind: "other", item: e.target.value})}
                    autoFocus
                />
            )}
        </label>
    );
}

/**
 * Says what the turtle has equipped on each side. Older CC: Tweaked can't read equipped items, so a tool never shows
 * up and Dig and Attack stay locked; seeding fills that in. The server keeps the seed until the turtle reports
 * equipment with item names.
 */
export function EquipmentForm({turtle, onDone}: Readonly<Props>) {
    const equipment = turtle.equipment;
    const initialLeft = equipment?.left ?? null;
    const initialRight = equipment?.right ?? null;

    const [left, setLeft] = useState(sideOf(initialLeft));
    const [right, setRight] = useState(sideOf(initialRight));
    const seed = useSeedEquipment(turtle.turtleId);

    const problem = sideError(left, "left") ?? sideError(right, "right");
    const changed = !sameUpgrade(sideUpgrade(left), initialLeft) || !sameUpgrade(sideUpgrade(right), initialRight);
    // Unknown equipment can be confirmed as it is, e.g. to say an older turtle's empty sides really are empty
    const canSave = !problem && (changed || !equipment?.itemsKnown) && !seed.isPending;
    const message = problem ?? (seed.isError ? seed.error.message : null);

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (!canSave) return;
        try {
            await seed.mutateAsync({left: sideUpgrade(left), right: sideUpgrade(right)});
            onDone();
        } catch {
            // Shown from the mutation's error below; the form stays open so it can be retried
        }
    }

    return (
        <form className="seed-form" onSubmit={submit}>
            <div className="seed-place">
                <SideSelect label="Left" current={initialLeft} value={left} onChange={setLeft}/>
                <SideSelect label="Right" current={initialRight} value={right} onChange={setRight}/>
            </div>

            <div className="seed-actions">
                <button type="submit" className="primary" disabled={!canSave}>
                    {seed.isPending ? "Saving…" : "Save"}
                </button>
                <button type="button" className="secondary" onClick={onDone} disabled={seed.isPending}>
                    Cancel
                </button>
            </div>

            {message && (
                <p className="seed-error small" role="alert">
                    {message}
                </p>
            )}
        </form>
    );
}
