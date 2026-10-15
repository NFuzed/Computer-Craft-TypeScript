import {type ReactNode, useState} from "react";
import {Capabilities, type Command, type CommandResult, type TurtleStatus} from "../api/schemas";
import {useTrip} from "../hooks/useTrip";
import {useTurtleCommand} from "../hooks/useTurtles";
import {GotoForm} from "./GotoForm";

interface Props {
    turtle: TurtleStatus;
}

/** What each command is called in buttons and messages. */
const COMMAND_LABELS: Record<Command, string> = {
    forward: "move forward",
    back: "move back",
    up: "move up",
    down: "move down",
    turnLeft: "turn left",
    turnRight: "turn right",
    dig: "dig in front",
    digUp: "dig up",
    digDown: "dig down",
    place: "place in front",
    placeUp: "place up",
    placeDown: "place down",
    drop: "drop in front",
    dropUp: "drop up",
    dropDown: "drop down",
    suck: "suck from the front",
    suckUp: "suck from above",
    suckDown: "suck from below",
    attack: "attack in front",
    attackUp: "attack up",
    attackDown: "attack down",
};

function commandLabel(command: string): string {
    return COMMAND_LABELS[command as Command] ?? command;
}

/** Movement buttons in a 3 × 2 grid, row by row: Down, forward, Up, then turn left, back, turn right. */
const MOVE_PAD: { command: Command; text: string }[] = [
    {command: "down", text: "Down"},
    {command: "forward", text: "↑"},
    {command: "up", text: "Up"},
    {command: "turnLeft", text: "↺"},
    {command: "back", text: "↓"},
    {command: "turnRight", text: "↻"},
];

/** Where a block action is aimed, in the order of its buttons: Down and Up sit under the move pad's Down and Up. */
const AIMS = ["Down", "Front", "Up"] as const;
type Aim = (typeof AIMS)[number];

/** 24 × 24 line icons drawn in the text colour. */
function Icon({children}: Readonly<{ children: ReactNode }>) {
    return (
        <svg className="action-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
             strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            {children}
        </svg>
    );
}

/**
 * Block actions, one tile each. Picking a tile shows a button for each aim that runs it. `needs` is the capability the
 * action requires. Drop and suck draw the turtle as a box with an item leaving or entering it.
 */
const ACTIONS: { name: string; commands: Record<Aim, Command>; needs?: string; icon: ReactNode }[] = [
    {
        name: "Dig",
        commands: {Front: "dig", Up: "digUp", Down: "digDown"},
        needs: Capabilities.DIG,
        icon: <Icon>
            <path d="M3.5 9.5Q10 3 19 5"/>
            <path d="M11 6.5L20.5 20.5"/>
        </Icon>,
    },
    {
        name: "Place",
        commands: {Front: "place", Up: "placeUp", Down: "placeDown"},
        icon: <Icon>
            <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/>
            <path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>
        </Icon>,
    },
    {
        name: "Drop",
        commands: {Front: "drop", Up: "dropUp", Down: "dropDown"},
        icon: <Icon>
            <rect x="3" y="6" width="9" height="12" rx="1.5"/>
            <path d="M12 12h9M17.5 8.5L21 12l-3.5 3.5"/>
        </Icon>,
    },
    {
        name: "Suck",
        commands: {Front: "suck", Up: "suckUp", Down: "suckDown"},
        icon: <Icon>
            <rect x="3" y="6" width="9" height="12" rx="1.5"/>
            <path d="M21 12h-9M15.5 8.5L12 12l3.5 3.5"/>
        </Icon>,
    },
    {
        name: "Attack",
        commands: {Front: "attack", Up: "attackUp", Down: "attackDown"},
        needs: Capabilities.ATTACK,
        icon: <Icon>
            <path d="M20.5 3.5l-.5 3.5-9 9-3-3 9-9z"/>
            <path d="M5 12l7 7M8.5 15.5L4 20"/>
        </Icon>,
    },
];

/**
 * Whether the turtle's equipment allows a capability. Unknown equipment (not reported, or an older CC: Tweaked that
 * can't see tools) doesn't block anything: the turtle says why if it can't.
 */
function allows(turtle: TurtleStatus, capability: string | undefined): boolean {
    const equipment = turtle.equipment;
    if (!capability || !equipment?.itemsKnown) return true;
    return equipment.capabilities.includes(capability);
}

/** Buttons that send one command at a time to the turtle, with the outcome of the last one. Mount with `key={turtleId}`. */
export function CommandPad({turtle}: Readonly<Props>) {
    const {send, pendingCommand, result, timedOut, error} = useTurtleCommand(turtle);
    const trip = useTrip(turtle.turtleId);
    // The action whose aim buttons are showing, if one is picked
    const [selected, setSelected] = useState<string | null>(null);
    const action = ACTIONS.find((a) => a.name === selected);
    const actionEnabled = action != null && allows(turtle, action.needs);
    // A command sent while the previous one runs is lost on the turtle, so only one is sent at a time. A trip runs a
    // whole path of commands, so nothing else is sent until it ends.
    const busy = !turtle.online || pendingCommand != null || trip.moving;
    // nav refuses to move an unseeded turtle; a seeded one has reported a position
    const canMove = turtle.position != null;

    const busyTitle = trip.moving ? "The turtle is on its way somewhere; stop it below first" : undefined;

    function button(command: Command, text: string, enabled = true, why?: string) {
        const label = commandLabel(command);
        return (
            <button
                key={command}
                type="button"
                className={command === pendingCommand ? "mc-button command pending" : "mc-button command"}
                disabled={busy || !enabled}
                aria-label={label}
                title={busyTitle ?? (enabled ? label : why)}
                onClick={() => send(command)}
            >
                {text}
            </button>
        );
    }

    return (
        <div className="command-pad">
            <div className="command-panel">
                <fieldset className="move-pad">
                    <legend className="visually-hidden">Movement</legend>
                    {MOVE_PAD.map(({command, text}) =>
                        button(command, text, canMove, "Seed the turtle's position before moving it"),
                    )}
                </fieldset>
            </div>

            <fieldset className="action-pad">
                <legend className="visually-hidden">Block actions</legend>
                {/* Three tiles on top and two below; the slimmer row's trim joins the wider one's into a stepped edge */}
                {[ACTIONS.slice(0, 3), ACTIONS.slice(3)].map((row, i) => (
                    <div key={row[0]!.name} className={`command-panel action-row${i > 0 ? " narrow" : ""}`}>
                        {row.map(({name, commands, needs, icon}) => {
                            const enabled = allows(turtle, needs);
                            const pending = AIMS.some((a) => commands[a] === pendingCommand);
                            let className = "mc-button action-tile";
                            if (name === selected) className += " selected";
                            if (pending) className += " pending";
                            return (
                                <button
                                    key={name}
                                    type="button"
                                    className={className}
                                    disabled={!enabled}
                                    aria-pressed={name === selected}
                                    title={enabled ? name : `Needs a tool that can ${needs}. Seed its equipment above.`}
                                    onClick={() => setSelected(name === selected ? null : name)}
                                >
                                    {icon}
                                    <span>{name}</span>
                                </button>
                            );
                        })}
                    </div>
                ))}
                <div className="command-panel action-aims">
                    {AIMS.map((aim) =>
                        action ? (
                            button(action.commands[aim], `${action.name} ${aim}`, actionEnabled)
                        ) : (
                            <button key={aim} type="button" className="mc-button command" disabled
                                    title="Pick an action above first">
                                {aim}
                            </button>
                        ),
                    )}
                </div>
            </fieldset>

            {!turtle.online && <p className="muted small">Offline: commands can be sent once the turtle reconnects.</p>}
            {turtle.online && !canMove && (
                <p className="muted small">Set the turtle’s position above before moving it.</p>
            )}
            {pendingCommand != null && (
                <p className="seed-pending small">Waiting for the turtle to {commandLabel(pendingCommand)}…</p>
            )}
            {pendingCommand == null && <CommandOutcome result={result} timedOut={timedOut} error={error}/>}

            <h4 className="group-heading goto-heading">Go to</h4>
            <GotoForm turtle={turtle} trip={trip}/>
        </div>
    );
}

function CommandOutcome({result, timedOut, error}: Readonly<{
    result: CommandResult | null;
    timedOut: string | null;
    error: Error | null;
}>) {
    if (error) return <p className="label-error small" role="alert">{error.message}</p>;
    if (timedOut) {
        return <p className="label-error small" role="alert">The turtle didn’t answer “{commandLabel(timedOut)}”.</p>;
    }
    if (!result) return null;
    if (!result.success) {
        return (
            <p className="label-error small" role="alert">
                Couldn’t {commandLabel(result.command)}: {result.error ?? "unknown reason"}
            </p>
        );
    }
    return <output className="refuel-ok small">Done: {commandLabel(result.command)}.</output>;
}
