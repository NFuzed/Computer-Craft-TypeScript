import {Capabilities, type Command, type CommandResult, type TurtleStatus} from "../api/schemas";
import {useTurtleCommand} from "../hooks/useTurtles";

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

/** Movement buttons, laid out like a D-pad with up and down beside it by `.move-pad`'s grid areas (named after them). */
const MOVE_PAD: { command: Command; text: string }[] = [
    {command: "forward", text: "↑"},
    {command: "turnLeft", text: "↺"},
    {command: "back", text: "↓"},
    {command: "turnRight", text: "↻"},
    {command: "up", text: "Up"},
    {command: "down", text: "Down"},
];

/** Block actions, each aimed at the front, above or below. `needs` is the capability the action requires. */
const ACTIONS: { name: string; commands: [Command, Command, Command]; needs?: string }[] = [
    {name: "Dig", commands: ["dig", "digUp", "digDown"], needs: Capabilities.DIG},
    {name: "Place", commands: ["place", "placeUp", "placeDown"]},
    {name: "Drop", commands: ["drop", "dropUp", "dropDown"]},
    {name: "Suck", commands: ["suck", "suckUp", "suckDown"]},
    {name: "Attack", commands: ["attack", "attackUp", "attackDown"], needs: Capabilities.ATTACK},
];
const DIRECTIONS = ["Front", "Up", "Down"] as const;

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
    // A command sent while the previous one runs is lost on the turtle, so only one is sent at a time
    const busy = !turtle.online || pendingCommand != null;
    // nav refuses to move an unseeded turtle; a seeded one has reported a position
    const canMove = turtle.position != null;

    function button(command: Command, text: string, enabled = true, why?: string, gridArea?: string) {
        const label = commandLabel(command);
        return (
            <button
                key={command}
                type="button"
                style={gridArea ? {gridArea} : undefined}
                className={command === pendingCommand ? "secondary command pending" : "secondary command"}
                disabled={busy || !enabled}
                aria-label={label}
                title={enabled ? label : why}
                onClick={() => send(command)}
            >
                {text}
            </button>
        );
    }

    return (
        <div className="command-pad">
            <fieldset className="move-pad">
                <legend className="visually-hidden">Movement</legend>
                {MOVE_PAD.map(({command, text}) =>
                    button(command, text, canMove, "Seed the turtle's position before moving it", command),
                )}
            </fieldset>

            <table className="action-grid">
                <thead>
                <tr>
                    <th/>
                    {DIRECTIONS.map((d) => <th key={d} scope="col" className="muted small">{d}</th>)}
                </tr>
                </thead>
                <tbody>
                {ACTIONS.map(({name, commands, needs}) => {
                    const enabled = allows(turtle, needs);
                    return (
                        <tr key={name}>
                            <th scope="row" className={enabled ? "small" : "small muted"}>{name}</th>
                            {commands.map((command, i) => (
                                <td key={command}>
                                    {button(command, DIRECTIONS[i]!, enabled, `Needs a tool that can ${needs}`)}
                                </td>
                            ))}
                        </tr>
                    );
                })}
                </tbody>
            </table>

            {!turtle.online && <p className="muted small">Offline: commands can be sent once the turtle reconnects.</p>}
            {turtle.online && !canMove && (
                <p className="muted small">Seed the turtle’s position above before moving it.</p>
            )}
            {pendingCommand != null && (
                <p className="seed-pending small">Waiting for the turtle to {commandLabel(pendingCommand)}…</p>
            )}
            {pendingCommand == null && <CommandOutcome result={result} timedOut={timedOut} error={error}/>}
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
