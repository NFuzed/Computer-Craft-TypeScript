import {type JSX, lazy, type PointerEvent, Suspense, useEffect, useLayoutEffect, useRef, useState} from "react";
import type {Station, TurtleStatus} from "../api/schemas";
import {
    DEFAULT_VIEW_DISTANCE,
    mapBoxFor,
    useWorldMap,
    VIEW_DISTANCES,
    type ViewDistance,
    viewSpan,
} from "../hooks/useWorldMap";
import {groupBy, turtleDimension, UNKNOWN_DIMENSION} from "../lib/fleet";
import {turtleColor, turtleName} from "../lib/format";
import {chestCell, stationDimension, stationTitle} from "../lib/stations";
import {WHEEL_ZOOM_SPEED, wheelPixels} from "../lib/wheel";

interface Props {
    turtles: TurtleStatus[];
    /** The stations in the shown world; the map draws those in the shown dimension. */
    stations: Station[];
    selectedId: number | null;
    onSelect: (id: number) => void;
}

type Placed = TurtleStatus & { position: NonNullable<TurtleStatus["position"]> };

type MapMode = "top" | "3d";

// three.js is most of the bundle, so it only loads once someone opens the 3D view.
const FleetMap3D = lazy(() => import("./FleetMap3D").then((m) => ({default: m.FleetMap3D})));

/** What the map is looking at: a centre point and how many blocks fit across the map's shorter side. */
interface Frame {
    cx: number;
    cz: number;
    span: number;
}

interface Size {
    width: number;
    height: number;
}

interface Drag {
    pointerId: number;
    startX: number;
    startY: number;
    origin: Frame;
    moved: boolean;
}

const MODE_KEY = "fleet-map-mode";
const VIEW_DISTANCE_KEY = "fleet-map-view-distance";
const MIN_SPAN = 16; // blocks; keeps a lone turtle from filling the whole map
const SELECTED_SPAN = 50; // blocks shown around the selected turtle
const MIN_ZOOM_SPAN = 5;
const MAX_ZOOM_SPAN = 20000;
const DRAG_THRESHOLD = 4; // px; a smaller movement is still a click

// Screen sizes, in px. The SVG is drawn in blocks, so these are converted with the current blocks-per-pixel.
const UNIT_PX = 10; // base size for strokes, text and the heading arrow
const MIN_MARKER_PX = 12; // a turtle fills its block, but never gets smaller than this
const MIN_CELL_PX = 8; // grid lines closer than this switch to a coarser step
const MIN_LABEL_PX = 70; // spacing between coordinate labels

const GRID_STEPS = [1, 5, 10, 50, 100, 500, 1000, 5000, 10000];
const LABEL_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];

// Minecraft: north is -Z, east is +X. SVG y grows downward, so +Z maps to +y and north points up.
const HEADING_DEGREES: Record<string, number> = {N: 0, E: 90, S: 180, W: 270};

/** Spacing of the fine grid: one line per block until that gets too dense. */
function gridStep(blocksPerPixel: number): number {
    return GRID_STEPS.find((s) => s / blocksPerPixel >= MIN_CELL_PX) ?? GRID_STEPS.at(-1)!;
}

/** Spacing of the labelled lines. Always a multiple of the grid step, so labels sit on drawn lines. */
function labelStep(blocksPerPixel: number, grid: number): number {
    return LABEL_STEPS.find((s) => s % grid === 0 && s / blocksPerPixel >= MIN_LABEL_PX) ?? LABEL_STEPS.at(-1)!;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** Dimensions that have turtles in them, busiest first. */
function dimensionsByCount(placed: Placed[]): string[] {
    return groupBy(placed, turtleDimension).map(([d]) => d);
}

/** The frame the map shows when the user hasn't moved it: the selected turtle, else every visible turtle. */
function autoFrameFor(visible: Placed[], selected: Placed | undefined, size: Size | null): Frame | null {
    if (visible.length === 0 || !size) return null;
    // A turtle fills the block [x, x + 1] × [z, z + 1], so centre on block centres.
    if (selected) {
        return {cx: selected.position.x + 0.5, cz: selected.position.z + 0.5, span: SELECTED_SPAN};
    }
    const xs = visible.map((t) => t.position.x + 0.5);
    const zs = visible.map((t) => t.position.z + 0.5);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const short = Math.min(size.width, size.height);
    const blocksPerPixel = Math.max(
        MIN_SPAN / short,
        ((maxX - minX) * 1.25) / size.width,
        ((maxZ - minZ) * 1.25) / size.height,
    );
    return {cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, span: blocksPerPixel * short};
}

/** The viewBox and grid spacing for a frame drawn into an element of the given size. */
function viewFor(frame: Frame, size: Size) {
    const blocksPerPixel = frame.span / Math.min(size.width, size.height);
    const width = size.width * blocksPerPixel;
    const height = size.height * blocksPerPixel;
    const grid = gridStep(blocksPerPixel);
    return {
        minX: frame.cx - width / 2,
        minZ: frame.cz - height / 2,
        width,
        height,
        blocksPerPixel,
        gridStep: grid,
        labelStep: labelStep(blocksPerPixel, grid),
    };
}

/** The view the user last picked. Storage can be unavailable (private windows, blocked site data). */
function storedMode(): MapMode {
    try {
        return localStorage.getItem(MODE_KEY) === "3d" ? "3d" : "top";
    } catch {
        return "top";
    }
}

/** The 3D view distance the user last picked. */
function storedViewDistance(): ViewDistance {
    try {
        const stored = Number(localStorage.getItem(VIEW_DISTANCE_KEY));
        return VIEW_DISTANCES.find((d) => d === stored) ?? DEFAULT_VIEW_DISTANCE;
    } catch {
        return DEFAULT_VIEW_DISTANCE;
    }
}

/** The element's size in pixels, or null while it has no area. */
function useElementSize(element: Element | null): Size | null {
    const [size, setSize] = useState<Size | null>(null);
    useLayoutEffect(() => {
        if (!element) return;
        const update = (rect: { width: number; height: number } | undefined) =>
            setSize(rect && rect.width > 0 && rect.height > 0 ? {width: rect.width, height: rect.height} : null);
        // Measure now so the first paint has a map; the observer only reports on the next rendering frame.
        update(element.getBoundingClientRect());
        const observer = new ResizeObserver((entries) => update(entries[0]?.contentRect));
        observer.observe(element);
        return () => observer.disconnect();
    }, [element]);
    return size;
}

type Keyed<T> = { key: string; value: T };

/**
 * State that belongs to what was being followed when it was set: it reads as null under any other key, and is dropped
 * once the key changes, so coming back to that key later starts afresh. Setting it for the new key just before the key
 * changes (a pick on the map) keeps it.
 */
function useKeyedState<T>(key: string) {
    const [state, setState] = useState<Keyed<T> | null>(null);
    const [lastKey, setLastKey] = useState(key);
    if (lastKey !== key) {
        setLastKey(key);
        if (state && state.key !== key) setState(null);
    }
    return [state?.key === key ? state.value : null, setState] as const;
}

export function FleetMap({turtles, stations, selectedId, onSelect}: Readonly<Props>) {
    const placed = turtles.filter((t): t is Placed => t.position != null);
    const dimensions = dimensionsByCount(placed);

    const selectedPlaced = placed.find((t) => t.turtleId === selectedId);
    const selectedDimension = selectedPlaced && turtleDimension(selectedPlaced);
    const [chosenDimension, setChosenDimension] = useState<string | null>(selectedDimension ?? null);

    // Selecting a turtle (or the selected turtle changing dimension) shows its dimension. The dropdown can still
    // switch away afterwards; that choice holds until the selection changes again.
    const followedKey = `${selectedId}:${selectedDimension}`;
    const [lastFollowed, setLastFollowed] = useState(followedKey);
    if (followedKey !== lastFollowed) {
        setLastFollowed(followedKey);
        if (selectedDimension) setChosenDimension(selectedDimension);
    }
    const dimension =
        chosenDimension && dimensions.includes(chosenDimension) ? chosenDimension : (dimensions[0] ?? UNKNOWN_DIMENSION);

    const [mode, setMode] = useState<MapMode>(storedMode);

    function chooseMode(next: MapMode) {
        setMode(next);
        // The 3D map is rebuilt each time it opens, so a camera the user moved is gone: follow again.
        if (next === "3d") setMoved3d(null);
        try {
            localStorage.setItem(MODE_KEY, next);
        } catch {
            // Not remembered; the map still switches.
        }
    }

    const visible = placed.filter((t) => turtleDimension(t) === dimension);
    const selected = visible.find((t) => t.turtleId === selectedId);
    const visibleStations = stations.filter((s) => stationDimension(s) === dimension);

    // Only the 3D map draws blocks, so the world map is only fetched while it's open.
    const [viewDistance, setViewDistance] = useState<ViewDistance>(storedViewDistance);
    const worldMap = useWorldMap(mode === "3d" ? mapBoxFor(visible, selected, viewDistance) : null);

    function chooseViewDistance(next: ViewDistance) {
        setViewDistance(next);
        try {
            localStorage.setItem(VIEW_DISTANCE_KEY, String(next));
        } catch {
            // Not remembered; the map still changes.
        }
    }

    // The viewBox matches the element's shape, so the map needs the element's size in pixels.
    const [svg, setSvg] = useState<SVGSVGElement | null>(null);
    const size = useElementSize(svg);

    const autoFrame = autoFrameFor(visible, selected, size);

    // Once the user drags or zooms, the map stops following the turtles until they recentre it, select another
    // turtle or change dimension. The key ties the manual frame to what was being followed when it was made.
    const followKeyFor = (turtleId: number | undefined) => `${dimension}:${turtleId ?? "all"}`;
    const followKey = followKeyFor(selected?.turtleId);
    const [manualFrame, setPanned] = useKeyedState<Frame>(followKey);
    const frame = autoFrame && (manualFrame ?? autoFrame);

    // The 3D camera follows the same way: until the user moves it, for whatever was being followed at the time.
    const [moved3d, setMoved3d] = useKeyedState<true>(followKey);
    const following3d = !moved3d;

    const [dragging, setDragging] = useState(false);
    const drag = useRef<Drag | null>(null);

    // The wheel listener is attached once per element, so it reads the current frame through a ref.
    const latest = useRef({autoFrame, followKey});
    useLayoutEffect(() => {
        latest.current = {autoFrame, followKey};
    });

    useEffect(() => {
        if (!svg) return;
        // Registered by hand because React's onWheel is passive and can't stop the page from scrolling.
        const onWheel = (e: WheelEvent) => {
            const {autoFrame, followKey} = latest.current;
            if (!autoFrame) return;
            e.preventDefault();
            const rect = svg.getBoundingClientRect();
            const short = Math.min(rect.width, rect.height);
            // Offset of the cursor from the centre of the map, in px.
            const ox = e.clientX - rect.left - rect.width / 2;
            const oy = e.clientY - rect.top - rect.height / 2;
            const factor = Math.exp(wheelPixels(e) * WHEEL_ZOOM_SPEED);
            // Functional update: several wheel events can arrive before the next render.
            setPanned((prev) => {
                const base = prev?.key === followKey ? prev.value : autoFrame;
                const span = clamp(base.span * factor, MIN_ZOOM_SPAN, MAX_ZOOM_SPAN);
                // Keep the block under the cursor where it is.
                const shift = (base.span - span) / short;
                return {key: followKey, value: {cx: base.cx + ox * shift, cz: base.cz + oy * shift, span}};
            });
        };
        svg.addEventListener("wheel", onWheel, {passive: false});
        return () => svg.removeEventListener("wheel", onWheel);
    }, [svg]);

    const view = frame && size && viewFor(frame, size);

    // Selecting from the list centres the map on the turtle, but selecting on the map keeps the map where it is:
    // the turtle is already in view, and jumping would move it out from under the cursor.
    function selectOnMap(turtleId: number) {
        if (frame) setPanned({key: followKeyFor(turtleId), value: frame});
        onSelect(turtleId);
    }

    function selectOn3d(turtleId: number) {
        setMoved3d({key: followKeyFor(turtleId), value: true});
        onSelect(turtleId);
    }

    function onPointerDown(e: PointerEvent<SVGSVGElement>) {
        if (e.button !== 0 || !frame) return;
        drag.current = {pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origin: frame, moved: false};
    }

    function onPointerMove(e: PointerEvent<SVGSVGElement>) {
        const d = drag.current;
        if (d?.pointerId !== e.pointerId || !svg) return;
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (!d.moved) {
            if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
            // Capture only once it is a drag: a captured pointer's click goes to the <svg>, so the marker under the
            // cursor isn't selected when a drag ends, but capturing on pointerdown would swallow plain clicks too.
            d.moved = true;
            svg.setPointerCapture(e.pointerId);
            setDragging(true);
        }
        const rect = svg.getBoundingClientRect();
        const blocksPerPixel = d.origin.span / Math.min(rect.width, rect.height);
        setPanned({
            key: followKey,
            value: {cx: d.origin.cx - dx * blocksPerPixel, cz: d.origin.cz - dy * blocksPerPixel, span: d.origin.span},
        });
    }

    function onPointerEnd(e: PointerEvent<SVGSVGElement>) {
        if (drag.current?.pointerId !== e.pointerId) return;
        drag.current = null;
        setDragging(false);
    }

    return (
        <section className="panel fleet-map">
            <header className="map-header">
                <h2>Fleet map</h2>
                <fieldset className="map-mode">
                    <legend className="visually-hidden">Map view</legend>
                    <button type="button" aria-pressed={mode === "top"} onClick={() => chooseMode("top")}>
                        Top-down
                    </button>
                    <button type="button" aria-pressed={mode === "3d"} onClick={() => chooseMode("3d")}>
                        3D
                    </button>
                </fieldset>
                {dimensions.length > 1 && (
                    <select
                        className="select"
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
                {mode === "3d" && visible.length > 0 && (
                    <select
                        className="select"
                        value={viewDistance}
                        onChange={(e) => chooseViewDistance(Number(e.target.value) as ViewDistance)}
                        aria-label="View distance"
                        title="How far around the selected turtle (or the middle of the fleet) blocks are loaded"
                    >
                        {VIEW_DISTANCES.map((d) => (
                            <option key={d} value={d}>
                                {d === 1 ? "1 chunk" : `${d} chunks`} ({viewSpan(d)} blocks)
                            </option>
                        ))}
                    </select>
                )}
                {mode === "3d" && visible.length > 0 && (
                    <span className="muted small">drag to orbit, right-drag to pan, scroll to zoom</span>
                )}
                {mode === "3d" && visible.length > 0 && !following3d && (
                    <button type="button" className="secondary map-recentre" onClick={() => setMoved3d(null)}>
                        Recentre
                    </button>
                )}
                {mode === "top" && view && (
                    <span className="muted small">
                        grid: {view.gridStep === 1 ? "1 block" : `${view.gridStep} blocks`} · north ↑ · drag to pan,
                        scroll to zoom
                    </span>
                )}
                {mode === "top" && view && manualFrame && (
                    <button type="button" className="secondary map-recentre" onClick={() => setPanned(null)}>
                        Recentre
                    </button>
                )}
            </header>

            {selectedDimension && selectedDimension !== dimension && (
                <p className="muted small">The selected turtle is in {selectedDimension}.</p>
            )}

            {visible.length > 0 && mode === "3d" && (
                <Suspense fallback={<p className="muted empty">Loading 3D map…</p>}>
                    <FleetMap3D
                        turtles={visible}
                        stations={visibleStations}
                        selectedId={selectedId}
                        following={following3d}
                        onCameraMoved={() => setMoved3d({key: followKey, value: true})}
                        onSelect={selectOn3d}
                        blocks={worldMap.data?.blocks}
                        blocksError={worldMap.isError}
                    />
                </Suspense>
            )}
            {visible.length > 0 && mode === "top" && (
                <svg
                    ref={setSvg}
                    className={dragging ? "map-svg dragging" : "map-svg"}
                    viewBox={view ? `${view.minX} ${view.minZ} ${view.width} ${view.height}` : undefined}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerEnd}
                    onPointerCancel={onPointerEnd}
                >
                    <title>{`Top-down map of ${visible.length} turtles in ${dimension}`}</title>
                    {view && (
                        <>
                            <GridLines
                                minX={view.minX}
                                minZ={view.minZ}
                                width={view.width}
                                height={view.height}
                                step={view.gridStep}
                                labelStep={view.labelStep}
                                unit={view.blocksPerPixel * UNIT_PX}
                            />
                            {visibleStations.map((s) => (
                                <StationMarker key={s.stationId} station={s} blocksPerPixel={view.blocksPerPixel}/>
                            ))}
                            {visible.map((t) => (
                                <TurtleMarker
                                    key={t.turtleId}
                                    turtle={t}
                                    blocksPerPixel={view.blocksPerPixel}
                                    selected={t.turtleId === selectedId}
                                    onSelect={selectOnMap}
                                />
                            ))}
                        </>
                    )}
                </svg>
            )}
            {visible.length === 0 && <p className="muted empty">No turtle positions yet.</p>}
        </section>
    );
}

function GridLines({minX, minZ, width, height, step, labelStep, unit}: Readonly<{
    minX: number;
    minZ: number;
    width: number;
    height: number;
    step: number;
    labelStep: number;
    unit: number
}>) {
    const lineClass = (v: number) => {
        if (v === 0) return "grid-axis";
        return v % labelStep === 0 ? "grid-line major" : "grid-line";
    };
    // Lines sit on block boundaries, so a turtle's square fills exactly one cell when step is 1.
    const lines: JSX.Element[] = [];
    for (let x = Math.ceil(minX / step) * step; x <= minX + width; x += step) {
        lines.push(
            <g key={`x${x}`}>
                <line x1={x} x2={x} y1={minZ} y2={minZ + height} className={lineClass(x)} strokeWidth={unit * 0.08}/>
                {x % labelStep === 0 && (
                    <text x={x + unit * 0.3} y={minZ + unit * 1.4} className="grid-label" fontSize={unit * 1.1}>
                        {x}
                    </text>
                )}
            </g>,
        );
    }
    for (let z = Math.ceil(minZ / step) * step; z <= minZ + height; z += step) {
        lines.push(
            <g key={`z${z}`}>
                <line x1={minX} x2={minX + width} y1={z} y2={z} className={lineClass(z)} strokeWidth={unit * 0.08}/>
                {z % labelStep === 0 && (
                    <text x={minX + unit * 0.3} y={z - unit * 0.3} className="grid-label" fontSize={unit * 1.1}>
                        {z}
                    </text>
                )}
            </g>,
        );
    }
    return <g>{lines}</g>;
}

/**
 * A diamond on the cell a turtle stands in, in the station type's colour, with a small square for the chest: in the
 * next cell when it's in front, in the middle when it's above or below. Drawn under the turtles.
 */
function StationMarker({station, blocksPerPixel}: Readonly<{ station: Station; blocksPerPixel: number }>) {
    const {x, z} = station;
    const unit = blocksPerPixel * UNIT_PX;
    const size = Math.max(1, blocksPerPixel * MIN_MARKER_PX);
    const half = size / 2;
    const chest = chestCell(station);
    // The chest's offset from the station, scaled with the marker so it stays beside it when zoomed out
    const chestOffset = chest ? {dx: (chest.x - x) * size, dz: (chest.z - z) * size} : null;
    const chestHalf = half * 0.4;

    return (
        <g transform={`translate(${x + 0.5} ${z + 0.5})`} className={`station-marker ${station.type}`}>
            <title>{stationTitle(station)}</title>
            <polygon points={`0,${-half} ${half},0 0,${half} ${-half},0`} className="station-pad"
                     strokeWidth={unit * 0.15}/>
            {chestOffset && (
                <rect x={chestOffset.dx - chestHalf} y={chestOffset.dz - chestHalf} width={chestHalf * 2}
                      height={chestHalf * 2} className="station-chest" strokeWidth={unit * 0.1}/>
            )}
            <text y={half + unit * 1.6} textAnchor="middle" className="station-label" fontSize={unit * 1.1}>
                {station.name}
            </text>
        </g>
    );
}

function TurtleMarker({
                          turtle,
                          blocksPerPixel,
                          selected,
                          onSelect,
                      }: Readonly<{
    turtle: Placed;
    blocksPerPixel: number;
    selected: boolean;
    onSelect: (id: number) => void;
}>) {
    const {x, z, heading} = turtle.position;
    const unit = blocksPerPixel * UNIT_PX;
    // The square fills the turtle's block, but stays big enough to see and click when zoomed out.
    const size = Math.max(1, blocksPerPixel * MIN_MARKER_PX);
    const half = size / 2;
    // Inset by half the stroke so the ring's outer edge lines up with the square's.
    const ringWidth = Math.min(unit * 0.35, size * 0.2);
    const ringHalf = half - ringWidth / 2;
    const rotation = heading == null ? undefined : HEADING_DEGREES[heading.toUpperCase()];
    const color = turtleColor(turtle.turtleId);

    // Clicking a marker is a mouse shortcut for the turtle list, which is the keyboard and screen-reader way to
    // select a turtle. SVG has no native <button>, so the marker is hidden from assistive tech instead.
    return (
        <g
            transform={`translate(${x + 0.5} ${z + 0.5})`}
            className={turtle.online ? "marker" : "marker offline"}
            onClick={() => onSelect(turtle.turtleId)}
            aria-hidden="true"
        >
            <title>
                {turtleName(turtle)} ({x}, {turtle.position.y}, {z}){turtle.online ? "" : " — offline"}
            </title>
            <rect x={-half} y={-half} width={size} height={size} fill={color} className="marker-dot"
                  strokeWidth={unit * 0.15}/>
            {rotation !== undefined && (
                <polygon
                    points={`0,${-half * 0.6} ${half * 0.5},${half * 0.4} ${-half * 0.5},${half * 0.4}`}
                    transform={`rotate(${rotation})`}
                    className="marker-arrow"
                />
            )}
            {selected && (
                <rect
                    x={-ringHalf}
                    y={-ringHalf}
                    width={ringHalf * 2}
                    height={ringHalf * 2}
                    className="marker-ring"
                    strokeWidth={ringWidth}
                />
            )}
            <text y={half + unit * 1.8} textAnchor="middle" className="marker-label" fontSize={unit * 1.3}>
                {turtle.label ?? `#${turtle.turtleId}`}
            </text>
        </g>
    );
}
