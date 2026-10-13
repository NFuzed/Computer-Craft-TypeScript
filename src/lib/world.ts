import {AIR} from "../api/schemas";

// Rough colours of common blocks, as 0xRRGGBB for three.js. Anything else gets a stable colour from its id.
const BLOCK_COLORS: Record<string, number> = {
    stone: 0x7d7d7d,
    cobblestone: 0x6f6f6f,
    mossy_cobblestone: 0x627256,
    smooth_stone: 0x9e9e9e,
    andesite: 0x888889,
    diorite: 0xbcbcbd,
    granite: 0x956755,
    tuff: 0x6c6d66,
    calcite: 0xdfe0dc,
    deepslate: 0x4d4d52,
    cobbled_deepslate: 0x4a4a4f,
    bedrock: 0x353535,
    dirt: 0x866043,
    coarse_dirt: 0x77553b,
    rooted_dirt: 0x90684d,
    mud: 0x3c393d,
    grass_block: 0x5d9b3a,
    podzol: 0x5b3f18,
    mycelium: 0x6f6265,
    farmland: 0x51341a,
    dirt_path: 0x947a41,
    sand: 0xdbcfa3,
    red_sand: 0xbe6621,
    sandstone: 0xd8cb9b,
    gravel: 0x837e7c,
    clay: 0xa1a6b3,
    snow: 0xf0fafa,
    snow_block: 0xf0fafa,
    ice: 0x91b7f7,
    packed_ice: 0x8db4f4,
    water: 0x3f76e4,
    lava: 0xd96415,
    obsidian: 0x1b1426,
    netherrack: 0x6e3533,
    glass: 0xc0dce0,
    torch: 0xffd36b,
    chest: 0xa2782f,
};

// Matched against the end of a block's name, after the exact names above.
const SUFFIX_COLORS: [string, number][] = [
    ["_leaves", 0x3c7a2a],
    ["_log", 0x6b5133],
    ["_wood", 0x6b5133],
    ["_planks", 0xa2824e],
    ["_glass", 0xc0dce0],
    ["_wool", 0xdedede],
    ["_terracotta", 0x985e43],
];

// Ores look like the stone around them with a fleck of the ore's colour; this shows the fleck.
const ORE_COLORS: [string, number][] = [
    ["coal", 0x2e2e2e],
    ["iron", 0xd8af93],
    ["copper", 0xc06a4b],
    ["gold", 0xf5d64a],
    ["redstone", 0xc81a1a],
    ["lapis", 0x2a50b8],
    ["diamond", 0x5fe3dc],
    ["emerald", 0x2bc45a],
    ["quartz", 0xe8e1d8],
];

/** Blocks drawn see-through, so they don't hide what's behind them. */
const TRANSLUCENT = new Set(["water", "ice", "glass", "lava"]);

/** "minecraft:oak_log" → "oak_log". */
function blockPath(name: string): string {
    return name.slice(name.indexOf(":") + 1);
}

/** Stable hue in degrees per block id, so the same block looks the same everywhere. */
export function blockHue(name: string): number {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
    return Math.abs(hash) % 360;
}

/** The colour to draw a block in, as 0xRRGGBB, or null for a hashed colour from blockHue. */
export function blockColor(name: string): number | null {
    const path = blockPath(name);
    const exact = BLOCK_COLORS[path];
    if (exact !== undefined) return exact;
    if (path.endsWith("_ore")) return ORE_COLORS.find(([metal]) => path.includes(metal))?.[1] ?? null;
    return SUFFIX_COLORS.find(([suffix]) => path.endsWith(suffix))?.[1] ?? null;
}

export function isTranslucent(name: string): boolean {
    const path = blockPath(name);
    return TRANSLUCENT.has(path) || path.endsWith("_glass") || path.endsWith("_glass_pane");
}

/**
 * Whether the 3D map draws a block. Air is known to be empty, and turtles are drawn from their live positions, so a
 * turtle another one saw (which has probably moved since) is left out.
 */
export function isDrawnBlock(name: string): boolean {
    return name !== AIR && !(name.startsWith("computercraft:turtle"));
}
