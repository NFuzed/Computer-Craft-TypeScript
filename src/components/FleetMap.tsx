import {type JSX, useMemo, useState} from "react";
import type {TurtleStatus} from "../api/schemas";
import {turtleColor, turtleName} from "../lib/format";

interface Props {
    turtles: TurtleStatus[];
    selectedId: number | null;
    onSelect: (id: number) => void;
}

type Placed = TurtleStatus & { position: NonNullable<TurtleStatus["position"]> };

const UNKNOWN_DIMENSION = "unknown";
const MIN_SPAN = 16; // blocks; keeps a lone turtle from filling the whole map

// Minecraft: north is -Z, east is +X. SVG y grows downward, so +Z maps to +y and north points up.
const HEADING_DEGREES: Record<string, number> = {N: 0, E: 90, S: 180, W: 270};

function niceStep(span: number): number {
    const raw = span / 10;
    const pow = 10 ** Math.floor(Math.log10(raw));
    const n = raw / pow;
    if (n < 1.5) return pow;
    if (n < 3.5) return 2 * pow;
    if (n < 7.5) return 5 * pow;
    return 10 * pow;
}

export function FleetMap({turtles, selectedId, onSelect}: Readonly<Props>) {
    const placed = useMemo(() => turtles.filter((t): t is Placed => t.position != null), [turtles]);

    const dimensions = useMemo(() => {
        const counts = new Map<string, number>();
        for (const t of placed) {
            const d = t.position.dimension ?? UNKNOWN_DIMENSION;
            counts.set(d, (counts.get(d) ?? 0) + 1);
        }
        return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => d);
    }, [placed]);

    const [chosenDimension, setChosenDimension] = useState<string | null>(null);
    const selectedDimension =
        placed.find((t) => t.turtleId === selectedId)?.position.dimension ?? null;
    const dimension =
        chosenDimension && dimensions.includes(chosenDimension) ? chosenDimension : (dimensions[0] ?? UNKNOWN_DIMENSION);

    const visible = placed.filter((t) => (t.position.dimension ?? UNKNOWN_DIMENSION) === dimension);

    const view = useMemo(() => {
        if (visible.length === 0) return null;
        const xs = visible.map((t) => t.position.x);
        const zs = visible.map((t) => t.position.z);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
        const span = Math.max(MIN_SPAN, (Math.max(...xs) - Math.min(...xs)) * 1.25, (Math.max(...zs) - Math.min(...zs)) * 1.25);
        const step = niceStep(span);
        return {minX: cx - span / 2, minZ: cz - span / 2, span, step, unit: span / 60};
    }, [visible]);

    return (
        <section className="panel fleet-map">
            <header className="map-header">
                <h2>Fleet map</h2>
                {dimensions.length > 1 && (
                    <select
                        value={dimension}
                        onChange={(e) => setChosenDimension(e.target.value)}
                        aria-label="Dimension"
                    >
                        {dimensions.map((d) => (
                            <option key={d} value={d}>
                                {d}
                            </option>
                        ))}
                    </select>
                )}
                {view && <span className="muted small">grid: {view.step} blocks · north ↑</span>}
            </header>

            {selectedDimension && selectedDimension !== dimension && (
                <p className="muted small">The selected turtle is in {selectedDimension}.</p>
            )}

            {view ? (
                <svg
                    className="map-svg"
                    viewBox={`${view.minX} ${view.minZ} ${view.span} ${view.span}`}
                    preserveAspectRatio="xMidYMid meet"
                >
                    <title>{`Top-down map of ${visible.length} turtles in ${dimension}`}</title>
                    <GridLines minX={view.minX} minZ={view.minZ} span={view.span} step={view.step} unit={view.unit}/>
                    {visible.map((t) => (
                        <TurtleMarker
                            key={t.turtleId}
                            turtle={t}
                            unit={view.unit}
                            selected={t.turtleId === selectedId}
                            onSelect={onSelect}
                        />
                    ))}
                </svg>
            ) : (
                <p className="muted empty">No turtle positions yet.</p>
            )}
        </section>
    );
}

function GridLines({minX, minZ, span, step, unit}: Readonly<{
    minX: number;
    minZ: number;
    span: number;
    step: number;
    unit: number
}>) {
    const lines: JSX.Element[] = [];
    for (let x = Math.ceil(minX / step) * step; x <= minX + span; x += step) {
        lines.push(
            <g key={`x${x}`}>
                <line x1={x} x2={x} y1={minZ} y2={minZ + span} className={x === 0 ? "grid-axis" : "grid-line"}
                      strokeWidth={unit * 0.08}/>
                <text x={x + unit * 0.3} y={minZ + unit * 1.4} className="grid-label" fontSize={unit * 1.1}>
                    {x}
                </text>
            </g>,
        );
    }
    for (let z = Math.ceil(minZ / step) * step; z <= minZ + span; z += step) {
        lines.push(
            <g key={`z${z}`}>
                <line x1={minX} x2={minX + span} y1={z} y2={z} className={z === 0 ? "grid-axis" : "grid-line"}
                      strokeWidth={unit * 0.08}/>
                <text x={minX + unit * 0.3} y={z - unit * 0.3} className="grid-label" fontSize={unit * 1.1}>
                    {z}
                </text>
            </g>,
        );
    }
    return <g>{lines}</g>;
}

function TurtleMarker({
                          turtle,
                          unit,
                          selected,
                          onSelect,
                      }: Readonly<{
    turtle: Placed;
    unit: number;
    selected: boolean;
    onSelect: (id: number) => void;
}>) {
    const {x, z, heading} = turtle.position;
    const r = unit * 1.2;
    const rotation = heading == null ? undefined : HEADING_DEGREES[heading.toUpperCase()];
    const color = turtleColor(turtle.turtleId);

    // Clicking a marker is a mouse shortcut for the turtle list, which is the keyboard and screen-reader way to
    // select a turtle. SVG has no native <button>, so the marker is hidden from assistive tech instead.
    return (
        <g
            transform={`translate(${x} ${z})`}
            className={turtle.online ? "marker" : "marker offline"}
            onClick={() => onSelect(turtle.turtleId)}
            aria-hidden="true"
        >
            <title>
                {turtleName(turtle)} ({x}, {turtle.position.y}, {z}){turtle.online ? "" : " — offline"}
            </title>
            {selected && <circle r={r * 1.7} className="marker-ring" strokeWidth={unit * 0.25}/>}
            {rotation !== undefined && (
                <polygon
                    points={`0,${-r * 2} ${r * 0.7},${-r * 0.6} ${-r * 0.7},${-r * 0.6}`}
                    transform={`rotate(${rotation})`}
                    fill={color}
                />
            )}
            <circle r={r} fill={color} className="marker-dot" strokeWidth={unit * 0.15}/>
            <text y={r * 3.2} textAnchor="middle" className="marker-label" fontSize={unit * 1.3}>
                {turtle.label ?? `#${turtle.turtleId}`}
            </text>
        </g>
    );
}
