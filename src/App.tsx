import {useState} from "react";
import {FleetMap} from "./components/FleetMap";
import {InventoryPanel} from "./components/InventoryPanel";
import {TurtleDetail} from "./components/TurtleDetail";
import {TurtleList} from "./components/TurtleList";
import {WorldList} from "./components/WorldList";
import {useDashboardSocket} from "./hooks/useDashboardSocket";
import {useTurtles} from "./hooks/useTurtles";
import {groupBy, turtleWorld} from "./lib/fleet";

const WORLD_KEY = "fleet-world";

function storedWorld(): string | null {
    try {
        return localStorage.getItem(WORLD_KEY);
    } catch {
        return null;
    }
}

export function App() {
    const socketState = useDashboardSocket();
    const live = socketState === "open";
    const {data: turtles = [], error, isPending} = useTurtles({live});
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const selected = turtles.find((t) => t.turtleId === selectedId);

    const worlds = groupBy(turtles, turtleWorld);
    const selectedWorld = selected && turtleWorld(selected);
    const [chosenWorld, setChosenWorld] = useState(storedWorld);
    // Like the map's dimension: selecting a turtle, or the selected turtle being seeded into another world, shows
    // its world.
    const followedKey = `${selectedId}:${selectedWorld}`;
    const [lastFollowed, setLastFollowed] = useState(followedKey);
    if (followedKey !== lastFollowed) {
        setLastFollowed(followedKey);
        if (selectedWorld !== undefined) setChosenWorld(selectedWorld);
    }
    const world = worlds.some(([w]) => w === chosenWorld) ? chosenWorld : (worlds[0]?.[0] ?? null);
    // Turtles that were never seeded have no world yet, so they're listed in every world where they can be seeded
    const shown = turtles.filter((t) => {
        const w = turtleWorld(t);
        return w === undefined || w === world;
    });

    function chooseWorld(next: string) {
        setChosenWorld(next);
        // Deselect a turtle that isn't in the new world, so the detail panel matches the list and map
        if (selectedWorld !== undefined && selectedWorld !== next) setSelectedId(null);
        try {
            localStorage.setItem(WORLD_KEY, next);
        } catch {
            // Not remembered; the world still changes.
        }
    }
    // The server counts as running if either the live socket or the REST fallback is getting through.
    const serverOnline = live || (isPending ? null : !error);

    return (
        <div className="app">
            <header className="topbar">
                <h1>Turtle Fleet</h1>
                <div
                    className={`status-pill${serverOnline ? " is-online" : ""}`}
                    title={statusTitle(serverOnline, live)}
                >
                    <span className="status-pill__dot"/>
                    {statusLabel(serverOnline)}
                </div>
            </header>

            {error && (
                <div className="banner error" role="alert">
                    Couldn’t reach the control server: {error.message}
                </div>
            )}

            <main className="layout">
                {isPending ? (
                    <p className="muted empty">Loading turtles…</p>
                ) : (
                    <>
                        <div className="side-column">
                            <WorldList worlds={worlds} selected={world} onSelect={chooseWorld}/>
                            <TurtleList turtles={shown} selectedId={selectedId} onSelect={setSelectedId}/>
                            <InventoryPanel turtle={selected}/>
                        </div>
                        <FleetMap turtles={shown} selectedId={selectedId} onSelect={setSelectedId}/>
                        <TurtleDetail turtle={selected} onClose={() => setSelectedId(null)}/>
                    </>
                )}
            </main>
        </div>
    );
}

function statusLabel(online: boolean | null): string {
    if (online === null) return "Checking…";
    return online ? "Running" : "Offline";
}

function statusTitle(online: boolean | null, live: boolean): string {
    if (!online) return "Can't reach the control server on :8000";
    return live ? "Receiving live updates over /ws/dashboard" : "Live socket unavailable; polling /api/turtles every 5s";
}
