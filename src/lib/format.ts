import {useEffect, useState} from "react";

/** Stable, distinct-ish colour per turtle id (golden-angle hue spacing). */
export function turtleColor(turtleId: number): string {
    return `hsl(${(turtleId * 137.508) % 360} 65% 55%)`;
}

export function turtleName(t: { turtleId: number; label: string | null }): string {
    return t.label ?? `Turtle #${t.turtleId}`;
}

export function formatAgo(unixSeconds: number | null, nowSeconds: number): string {
    if (unixSeconds == null) return "never";
    const s = Math.max(0, nowSeconds - unixSeconds);
    if (s < 5) return "just now";
    if (s < 60) return `${Math.floor(s)}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}

export function formatTimestamp(unixSeconds: number | null): string {
    return unixSeconds == null ? "—" : new Date(unixSeconds * 1000).toLocaleString();
}

/** Current unix time in seconds, re-rendering every `intervalMs` so "x ago" labels stay fresh. */
export function useNowSeconds(intervalMs = 5_000): number {
    const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
    useEffect(() => {
        const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);
    return now;
}
