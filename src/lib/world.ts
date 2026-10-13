/**
 * A block the fleet knows about, e.g. from a turtle's inspect() or a geo scanner. Nothing reports these yet: the 3D map
 * already draws them so that world context only needs a data source once the server starts collecting it.
 */
export interface WorldBlock {
    x: number;
    y: number;
    z: number;
    name: string; // block id, e.g. "minecraft:stone"
}

/** Stable hue in degrees per block id, so the same block looks the same everywhere. */
export function blockHue(name: string): number {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
    return Math.abs(hash) % 360;
}
