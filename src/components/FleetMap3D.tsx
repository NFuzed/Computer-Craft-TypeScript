import {useEffect, useLayoutEffect, useRef} from "react";
import * as THREE from "three";
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls.js";
import {CSS2DObject, CSS2DRenderer} from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type {TurtleStatus} from "../api/schemas";
import {turtleHue, turtleName} from "../lib/format";
import {WHEEL_ZOOM_SPEED, wheelPixels} from "../lib/wheel";
import {blockHue, type WorldBlock} from "../lib/world";

type Placed = TurtleStatus & { position: NonNullable<TurtleStatus["position"]> };

interface Props {
    turtles: Placed[];
    selectedId: number | null;
    /** Whether the camera follows the selected turtle (or the whole fleet). False once the user has moved it. */
    following: boolean;
    /** Called when the user orbits, pans or zooms, so the parent can stop following and offer a Recentre. */
    onCameraMoved: () => void;
    onSelect: (id: number) => void;
    blocks?: WorldBlock[];
}

/** Everything created once per mounted map. */
interface Stage {
    renderer: THREE.WebGLRenderer;
    labels: CSS2DRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    turtleGroup: THREE.Group;
    blockGroup: THREE.Group;
    floorGroup: THREE.Group;
    invalidate: () => void;
}

// Colours from the palette in index.css (WebGL can't read CSS variables or alpha in colour strings).
const MAP_BG = 0x060b17; // --map-bg
const GRID_COLOR = 0x378add; // --accent, drawn faint like --grid
const SELECTED_COLOR = 0xe8f3ff; // --text
const TURTLE_SATURATION = 0.65; // matches turtleColor()
const TURTLE_LIGHTNESS = 0.55;
const OFFLINE_OPACITY = 0.45;

const DRAG_THRESHOLD = 4; // px; a smaller movement is still a click
const ZOOM_EASE_MS = 70; // time constant of the wheel zoom easing; most of a notch lands within ~150 ms
const SELECTED_DISTANCE = 24; // blocks from the camera to the selected turtle
const MIN_DISTANCE = 3;
const MAX_DISTANCE = 20000;
const MIN_GRID = 64; // blocks across the floor grid
const MAX_GRID_LINES = 200; // past this the grid steps over several blocks per line

// The camera looks from the south and above, so north is away from the viewer like "north ↑" on the top-down map.
// Minecraft and three.js are both right-handed with +Y up, so world coordinates are used as they are.
const VIEW_DIRECTION = new THREE.Vector3(0.35, 0.9, 1).normalize();

// Minecraft: north is -Z, east is +X. The heading arrow is drawn pointing north and turned about +Y.
const HEADING_RADIANS: Record<string, number> = {N: 0, E: -Math.PI / 2, S: Math.PI, W: Math.PI / 2};

// Shared by every turtle; materials differ per turtle so they're made per marker.
const BOX = new THREE.BoxGeometry(0.9, 0.9, 0.9);
const OUTLINE = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02));
const ARROW = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0.451, -0.3),
    new THREE.Vector3(-0.22, 0.451, 0.2),
    new THREE.Vector3(0.22, 0.451, 0.2),
]);
const BLOCK = new THREE.BoxGeometry(1, 1, 1);

/** Where the camera should look and from how far: the selected turtle, else the middle of the whole fleet. */
function frameFor(turtles: Placed[], selected: Placed | undefined) {
    if (selected) {
        const {x, y, z} = selected.position;
        return {target: new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5), distance: SELECTED_DISTANCE, floorY: y};
    }
    const box = new THREE.Box3();
    for (const t of turtles) box.expandByPoint(new THREE.Vector3(t.position.x, t.position.y, t.position.z));
    box.max.addScalar(1); // a turtle fills [x, x + 1]
    const radius = box.getSize(new THREE.Vector3()).length() / 2;
    return {
        target: box.getCenter(new THREE.Vector3()),
        distance: Math.max(SELECTED_DISTANCE, radius * 2.4),
        floorY: box.min.y,
    };
}

function disposeChildren(group: THREE.Group) {
    for (const child of [...group.children]) {
        group.remove(child);
        child.traverse((o) => {
            // A label only removes its element when it is removed itself, not when an ancestor is.
            if (o instanceof CSS2DObject) o.element.remove();
            // Shared geometries are kept; per-marker materials and one-off geometries go.
            // Meshes, lines and the instanced block mesh all carry these; groups and labels have neither.
            const {geometry, material} = o as Partial<Pick<THREE.Mesh, "geometry" | "material">>;
            if (geometry && ![BOX, OUTLINE, ARROW, BLOCK].includes(geometry)) geometry.dispose();
            if (material) for (const m of [material].flat()) m.dispose();
        });
    }
}

const NO_BLOCKS: WorldBlock[] = [];

export function FleetMap3D({
                               turtles,
                               selectedId,
                               following,
                               onCameraMoved,
                               onSelect,
                               blocks = NO_BLOCKS
                           }: Readonly<Props>) {
    const containerRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<Stage | null>(null);
    const selected = turtles.find((t) => t.turtleId === selectedId);

    // Listeners are attached once, so they read the current callbacks through a ref.
    const latest = useRef({onCameraMoved, onSelect});
    useLayoutEffect(() => {
        latest.current = {onCameraMoved, onSelect};
    });

    // Whether the camera has been snapped to the current frame since following last started. Following a moving
    // turtle shifts the camera with it instead, keeping the angle and distance the frame started with.
    const framed = useRef(false);
    // Whether the camera has been placed at all. A new map starts with the camera at the origin, so it is framed once
    // even when it mounts not following, rather than looking at nothing.
    const placed = useRef(false);

    useEffect(() => {
        const container = containerRef.current!;
        const renderer = new THREE.WebGLRenderer({antialias: true});
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setClearColor(MAP_BG);
        container.appendChild(renderer.domElement);

        const labels = new CSS2DRenderer();
        labels.domElement.className = "map-3d-labels";
        container.appendChild(labels.domElement);

        const scene = new THREE.Scene();
        scene.add(new THREE.AmbientLight(0xffffff, 1.4));
        const sun = new THREE.DirectionalLight(0xffffff, 1.6);
        sun.position.set(0.4, 1, 0.7); // lights the top brightest and the south and east faces more than the others
        scene.add(sun);

        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100000);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.minDistance = MIN_DISTANCE;
        controls.maxDistance = MAX_DISTANCE;

        const turtleGroup = new THREE.Group();
        const blockGroup = new THREE.Group();
        const floorGroup = new THREE.Group();
        scene.add(floorGroup, blockGroup, turtleGroup);

        // OrbitControls applies wheel zoom in one jump per wheel event, and wheel events don't line up with frames,
        // so zooming stuttered while orbiting (which is damped) glided. The wheel handler below collects the zoom
        // instead, and each frame applies part of what is left, moving the camera toward or away from the point it
        // orbits. That point stays where it is.
        let zoomPending = 1; // scale of the camera's distance still to apply
        const easeZoom = (dt: number): boolean => {
            if (Math.abs(Math.log(zoomPending)) < 1e-4) {
                zoomPending = 1;
                return false;
            }
            const distance = camera.position.distanceTo(controls.target);
            const wanted = zoomPending ** (1 - Math.exp(-dt / ZOOM_EASE_MS));
            const step = THREE.MathUtils.clamp(distance * wanted, MIN_DISTANCE, MAX_DISTANCE) / distance;
            // At a zoom limit, drop the rest instead of pushing against it for the next frames.
            zoomPending = step === wanted ? zoomPending / step : 1;
            camera.position.sub(controls.target).multiplyScalar(step).add(controls.target);
            return true;
        };

        // Render on demand: when something changed or the camera is still moving (damping and zoom easing).
        let dirty = true;
        const invalidate = () => {
            dirty = true;
        };
        let frame = 0;
        let lastFrame = performance.now();
        const loop = (now: number) => {
            frame = requestAnimationFrame(loop);
            const dt = Math.min(100, now - lastFrame); // a hidden tab pauses the loop; don't jump when it resumes
            lastFrame = now;
            const zoomed = easeZoom(dt);
            if (controls.update() || zoomed || dirty) {
                dirty = false;
                renderer.render(scene, camera);
                labels.render(scene, camera);
            }
        };
        frame = requestAnimationFrame(loop);

        const resize = (width: number, height: number) => {
            if (width <= 0 || height <= 0) return;
            renderer.setSize(width, height);
            labels.setSize(width, height);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            // Resizing clears the canvas, and the observer runs after this frame's render, so draw now rather than
            // flash an empty map for a frame (e.g. when the Recentre button wraps the header).
            renderer.render(scene, camera);
            labels.render(scene, camera);
        };
        const rect = container.getBoundingClientRect();
        resize(rect.width, rect.height);
        const observer = new ResizeObserver((entries) => {
            const r = entries[0]?.contentRect;
            if (r) resize(r.width, r.height);
        });
        observer.observe(container);

        // The controls also move the camera when following, so only movement during a gesture counts as the user's.
        let interacting = false;
        controls.addEventListener("start", () => {
            interacting = true;
        });
        controls.addEventListener("end", () => {
            interacting = false;
        });
        controls.addEventListener("change", () => {
            if (!interacting) return;
            framed.current = false;
            latest.current.onCameraMoved();
        });

        // Click a turtle to select it; a drag is an orbit or pan and selects nothing.
        let down: { x: number; y: number } | null = null;
        const raycaster = new THREE.Raycaster();
        const rayAt = (clientX: number, clientY: number) => {
            const r = renderer.domElement.getBoundingClientRect();
            const pointer = new THREE.Vector2(
                ((clientX - r.left) / r.width) * 2 - 1,
                -((clientY - r.top) / r.height) * 2 + 1,
            );
            raycaster.setFromCamera(pointer, camera);
            return raycaster;
        };
        const onPointerDown = (e: PointerEvent) => {
            down = e.button === 0 ? {x: e.clientX, y: e.clientY} : null;
        };
        const onPointerUp = (e: PointerEvent) => {
            if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) >= DRAG_THRESHOLD) return;
            down = null;
            const hit = rayAt(e.clientX, e.clientY).intersectObjects(turtleGroup.children, true)
                .find((h) => h.object.userData.turtleId != null);
            if (hit) latest.current.onSelect(hit.object.userData.turtleId as number);
        };

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            // Captured on the container, so OrbitControls' own wheel zoom on the canvas never runs. Its pinch zoom
            // on touch screens still does.
            e.stopPropagation();
            zoomPending *= Math.exp(wheelPixels(e) * WHEEL_ZOOM_SPEED);
            framed.current = false;
            latest.current.onCameraMoved();
        };
        container.addEventListener("wheel", onWheel, {passive: false, capture: true});
        renderer.domElement.addEventListener("pointerdown", onPointerDown);
        renderer.domElement.addEventListener("pointerup", onPointerUp);

        stageRef.current = {renderer, labels, scene, camera, controls, turtleGroup, blockGroup, floorGroup, invalidate};

        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            container.removeEventListener("wheel", onWheel, {capture: true});
            renderer.domElement.removeEventListener("pointerdown", onPointerDown);
            renderer.domElement.removeEventListener("pointerup", onPointerUp);
            controls.dispose();
            for (const g of [turtleGroup, blockGroup, floorGroup]) disposeChildren(g);
            renderer.dispose();
            container.removeChild(renderer.domElement);
            container.removeChild(labels.domElement);
            stageRef.current = null;
        };
    }, []);

    // Turtles: rebuilt on every update, which is cheap for a fleet of turtles.
    useEffect(() => {
        const stage = stageRef.current;
        if (!stage) return;
        disposeChildren(stage.turtleGroup);
        for (const t of turtles) stage.turtleGroup.add(turtleMarker(t, t.turtleId === selectedId));
        stage.invalidate();
    }, [turtles, selectedId]);

    // World blocks share one instanced mesh, so thousands of them stay one draw call.
    useEffect(() => {
        const stage = stageRef.current;
        if (!stage) return;
        disposeChildren(stage.blockGroup);
        if (blocks.length > 0) {
            const mesh = new THREE.InstancedMesh(BLOCK, new THREE.MeshLambertMaterial(), blocks.length);
            const matrix = new THREE.Matrix4();
            const color = new THREE.Color();
            blocks.forEach((b, i) => {
                mesh.setMatrixAt(i, matrix.makeTranslation(b.x + 0.5, b.y + 0.5, b.z + 0.5));
                mesh.setColorAt(i, color.setHSL(blockHue(b.name) / 360, 0.35, 0.4));
            });
            stage.blockGroup.add(mesh);
        }
        stage.invalidate();
    }, [blocks]);

    // Camera and floor grid follow the selected turtle, or the whole fleet when none is selected.
    const {target, distance, floorY} = frameFor(turtles, selected);
    const spread = selected ? 0 : distance;
    useEffect(() => {
        const stage = stageRef.current;
        if (!stage) return;
        const {camera, controls} = stage;
        if (following || !placed.current) {
            if (following && framed.current) {
                // Keep the user's angle and zoom from when following started; move with the turtle.
                const delta = target.clone().sub(controls.target);
                controls.target.add(delta);
                camera.position.add(delta);
            } else {
                controls.target.copy(target);
                camera.position.copy(target).addScaledVector(VIEW_DIRECTION, distance);
                framed.current = following;
                placed.current = true;
            }
            controls.update();
        }

        disposeChildren(stage.floorGroup);
        stage.floorGroup.add(floorGrid(target, floorY, spread));
        for (const t of turtles) stage.floorGroup.add(dropLine(t, floorY));
        stage.invalidate();
        // The target is compared by value; a new Vector3 each render isn't a change.
    }, [following, target.x, target.y, target.z, distance, floorY, spread, turtles]);

    // A new selection starts following afresh, so the camera snaps to the new frame. (Moving the camera does the same
    // for Recentre.) A layout effect, so it runs before the camera effect above.
    useLayoutEffect(() => {
        framed.current = false;
    }, [selected?.turtleId]);

    return (
        <div ref={containerRef} className="map-3d">
            <span className="visually-hidden">{`3D map of ${turtles.length} turtles`}</span>
        </div>
    );
}

/** A box filling the turtle's block, an arrow on top for its heading, an outline when selected and a name tag. */
function turtleMarker(turtle: Placed, selected: boolean): THREE.Group {
    const {x, y, z, heading} = turtle.position;
    const group = new THREE.Group();
    group.position.set(x + 0.5, y + 0.5, z + 0.5);

    const opacity = turtle.online ? 1 : OFFLINE_OPACITY;
    const color = new THREE.Color().setHSL(turtleHue(turtle.turtleId) / 360, TURTLE_SATURATION, TURTLE_LIGHTNESS);
    const box = new THREE.Mesh(BOX, new THREE.MeshLambertMaterial({color, transparent: !turtle.online, opacity}));
    box.userData.turtleId = turtle.turtleId;
    group.add(box);

    const rotation = heading == null ? undefined : HEADING_RADIANS[heading.toUpperCase()];
    if (rotation !== undefined) {
        const arrow = new THREE.Mesh(ARROW, new THREE.MeshBasicMaterial({
            color: MAP_BG,
            transparent: true,
            opacity: 0.85 * opacity,
            side: THREE.DoubleSide,
        }));
        arrow.rotation.y = rotation;
        group.add(arrow);
    }

    if (selected) {
        group.add(new THREE.LineSegments(OUTLINE, new THREE.LineBasicMaterial({color: SELECTED_COLOR})));
    }

    const tag = document.createElement("div");
    tag.className = turtle.online ? "map-3d-label" : "map-3d-label offline";
    tag.textContent = turtle.label ?? `#${turtle.turtleId}`;
    tag.title = `${turtleName(turtle)} (${x}, ${y}, ${z})${turtle.online ? "" : " — offline"}`;
    const label = new CSS2DObject(tag);
    label.position.set(0, 0.85, 0);
    group.add(label);
    return group;
}

/** A floor grid on block boundaries at the given height, with compass letters at its edges. */
function floorGrid(center: THREE.Vector3, y: number, spread: number): THREE.Group {
    const wanted = Math.max(MIN_GRID, Math.ceil(spread * 1.5));
    const step = Math.max(1, Math.ceil(wanted / MAX_GRID_LINES));
    const lines = Math.ceil(wanted / step / 2) * 2; // even, so the grid's centre lies on a line
    const size = lines * step;

    const group = new THREE.Group();
    // Snap to the step so lines stay on block boundaries (and on multiples of the step) as the centre moves.
    group.position.set(Math.round(center.x / step) * step, y, Math.round(center.z / step) * step);

    const grid = new THREE.GridHelper(size, lines, GRID_COLOR, GRID_COLOR);
    const material = grid.material;
    material.transparent = true;
    material.opacity = 0.22;
    material.depthWrite = false;
    group.add(grid);

    const half = size / 2;
    const compass: [string, number, number][] = [["N", 0, -half], ["E", half, 0], ["S", 0, half], ["W", -half, 0]];
    for (const [letter, cx, cz] of compass) {
        const tag = document.createElement("div");
        tag.className = "map-3d-compass";
        tag.textContent = letter;
        const label = new CSS2DObject(tag);
        label.position.set(cx, 0, cz);
        group.add(label);
    }
    return group;
}

/** A faint line from the turtle down (or up) to the floor grid, so its height reads at a glance. */
function dropLine(turtle: Placed, floorY: number): THREE.Line {
    const {x, y, z} = turtle.position;
    const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x + 0.5, y, z + 0.5),
        new THREE.Vector3(x + 0.5, floorY, z + 0.5),
    ]);
    return new THREE.Line(geometry, new THREE.LineBasicMaterial({color: GRID_COLOR, transparent: true, opacity: 0.5}));
}
