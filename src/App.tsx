import {useState} from "react";
import {FleetMap} from "./components/FleetMap";
import {InventoryPanel} from "./components/InventoryPanel";
import {TurtleDetail} from "./components/TurtleDetail";
import {TurtleList} from "./components/TurtleList";
import {useDashboardSocket} from "./hooks/useDashboardSocket";
import {useTurtles} from "./hooks/useTurtles";

const CONNECTION_LABEL = {
    open: "live",
    connecting: "connecting…",
    closed: "polling",
} as const;

export function App() {
    const socketState = useDashboardSocket();
    const live = socketState === "open";
    const {data: turtles = [], error, isPending} = useTurtles({live});
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const selected = turtles.find((t) => t.turtleId === selectedId);

    return (
        <div className="app">
            <header className="topbar">
                <h1>Turtle Fleet</h1>
                <span
                    className={`connection ${socketState}`}
                    title={live ? "Receiving live updates over /ws/dashboard" : "Live socket unavailable; polling /api/turtles every 5s"}
                >
          {CONNECTION_LABEL[socketState]}
        </span>
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
