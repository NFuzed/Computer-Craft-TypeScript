import {type FormEvent, useId, useState} from "react";
import {MAX_REFUEL_COUNT, type RefuelResult, type TurtleInventory} from "../api/schemas";

interface Props {
    inventory: TurtleInventory;
    online: boolean;
    /** Sends a refuel; null burns the whole selected stack. */
    onRefuel: (count: number | null) => void;
    pending: boolean;
    result: RefuelResult | null;
    timedOut: boolean;
    error: Error | null;
}

const numberFormat = new Intl.NumberFormat();

/** Fuel gauge plus "Refuel ×N" and "Refuel all" for the selected slot. Mount with `key={turtleId}`. */
export function RefuelForm({inventory, online, onRefuel, pending, result, timedOut, error}: Readonly<Props>) {
    const [count, setCount] = useState("1");

    const item = inventory.slots.find((s) => s.slot === inventory.selectedSlot);
    const max = Math.min(MAX_REFUEL_COUNT, item?.count ?? 0);
    const n = Number(count);
    const countValid = Number.isInteger(n) && n >= 1 && n <= max;
    const disabled = !online || !item || pending;

    function submit(e: FormEvent) {
        e.preventDefault();
        if (!disabled && countValid) onRefuel(n);
    }

    // No hint while offline: the inventory panel already says so
    let hint: string | null = null;
    if (online && !item) hint = `Slot ${inventory.selectedSlot} is empty. Select a slot with fuel in it.`;
    else if (online && !countValid) hint = `Enter a number from 1 to ${max}.`;

    return (
        <div className="refuel">
            <FuelGauge inventory={inventory}/>

            <form className="refuel-form" onSubmit={submit}>
                <input
                    type="number"
                    aria-label="Items to burn"
                    min={1}
                    max={Math.max(1, max)}
                    step={1}
                    value={count}
                    disabled={!online || !item}
                    onChange={(e) => setCount(e.target.value)}
                />
                <button type="submit" className="primary" disabled={disabled || !countValid}>
                    Refuel
                </button>
                <button
                    type="button"
                    className="secondary"
                    disabled={disabled}
                    title="Burn the whole stack in the selected slot"
                    onClick={() => onRefuel(null)}
                >
                    Refuel all
                </button>
            </form>

            {hint && <p className="muted small">{hint}</p>}
            {pending && <p className="seed-pending small">Waiting for the turtle to refuel…</p>}
            {!pending && <RefuelOutcome result={result} timedOut={timedOut} error={error}/>}
        </div>
    );
}

function FuelGauge({inventory}: Readonly<{ inventory: TurtleInventory }>) {
    const meterId = useId();
    const fuel = inventory.fuel;
    if (!fuel) return <p className="muted small">Fuel: not reported (update the turtle's code).</p>;
    if (fuel.level == null || fuel.limit == null) return <p className="small">Fuel: <strong>unlimited</strong></p>;

    return (
        <div className="fuel-gauge">
            <label htmlFor={meterId} className="small">Fuel</label>
            <meter id={meterId} className="fuel-bar" min={0} max={fuel.limit} value={fuel.level}/>
            <span className="small mono">
                {numberFormat.format(fuel.level)} / {numberFormat.format(fuel.limit)}
            </span>
        </div>
    );
}

function RefuelOutcome({result, timedOut, error}: Readonly<Pick<Props, "result" | "timedOut" | "error">>) {
    if (error) return <p className="label-error small" role="alert">{error.message}</p>;
    if (timedOut) return <p className="label-error small" role="alert">The turtle didn’t answer the refuel.</p>;
    if (!result) return null;
    if (!result.refueled) {
        return <p className="label-error small" role="alert">Couldn’t refuel: {result.error ?? "unknown reason"}</p>;
    }
    return (
        <output className="refuel-ok small">
            {result.fuelAdded == null ? "Refuelled." : `Refuelled: +${numberFormat.format(result.fuelAdded)} fuel.`}
        </output>
    );
}
