import {useState} from "react";
import {FleetMap} from "./components/FleetMap";
import {InventoryPanel} from "./components/InventoryPanel";
import {TurtleDetail} from "./components/TurtleDetail";
import {TurtleList} from "./components/TurtleList";
import {useDashboardSocket} from "./hooks/useDashboardSocket";
import {useTurtles} from "./hooks/useTurtles";

export function App() {
    const socketState = useDashboardSocket();
    const live = socketState === "open";
    const {data: turtles = [], error, isPending} = useTurtles({live});
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const selected = turtles.find((t) => t.turtleId === selectedId);
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
                            <TurtleList turtles={turtles} selectedId={selectedId} onSelect={setSelectedId}/>
                            <InventoryPanel turtle={selected}/>
                        </div>
                        <FleetMap turtles={turtles} selectedId={selectedId} onSelect={setSelectedId}/>
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
