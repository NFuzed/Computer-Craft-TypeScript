import {useEffect, useState} from "react";

/** Hue in degrees for a turtle id; golden-angle spacing keeps neighbouring ids distinct. */
export function turtleHue(turtleId: number): number {
    return (turtleId * 137.508) % 360;
}

/** Stable, distinct-ish colour per turtle id. Saturation and lightness match the 3D map's TURTLE_SATURATION/LIGHTNESS. */
export function turtleColor(turtleId: number): string {
    return `hsl(${turtleHue(turtleId)} 65% 55%)`;
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

/** "minecraft:oak_log" → "Oak Log"; items from other mods keep their namespace, e.g. "Turtle Advanced (computercraft)". */
export function itemDisplayName(itemId: string): string {
    const [namespace, path] = splitItemId(itemId);
    const name = path.split("_").filter(Boolean).map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ");
    return namespace === "minecraft" ? name : `${name} (${namespace})`;
}

/** Up to two letters standing in for an item's icon: "oak_log" → "OL", "cobblestone" → "Co". */
export function itemAbbreviation(itemId: string): string {
    const words = splitItemId(itemId)[1].split("_").filter(Boolean);
    if (words.length === 0) return "?";
    if (words.length === 1) return words[0]!.slice(0, 2).replace(/^./, (c) => c.toUpperCase());
    return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}

/** Stable colour per item id, so the same item looks the same in every slot and turtle. */
export function itemColor(itemId: string): string {
    let hash = 0;
    for (let i = 0; i < itemId.length; i++) hash = (hash * 31 + itemId.charCodeAt(i)) | 0;
    return `hsl(${Math.abs(hash) % 360} 45% 45%)`;
}

function splitItemId(itemId: string): [string, string] {
    const i = itemId.indexOf(":");
    return i === -1 ? ["minecraft", itemId] : [itemId.slice(0, i), itemId.slice(i + 1)];
}
