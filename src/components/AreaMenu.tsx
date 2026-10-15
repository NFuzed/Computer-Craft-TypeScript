import {ZONE_TYPES, type ZoneType} from "../api/schemas";
import {useCreateZone, useZones} from "../hooks/useZones";
import {type Area, areaCornersText, areaSizeText, nextZoneName, zoneRequestFor} from "../lib/zones";
import {ContextMenu, type MenuEntry} from "./ContextMenu";

interface Props {
    area: Area;
    /** The world and dimension the map is showing, which the new zone is in. */
    world: string | null;
    dimension: string;
    /** Where the right-drag ended, in client px. */
    x: number;
    y: number;
    onClose: () => void;
}

const ZONE_ENTRY_LABELS: Record<ZoneType, string> = {
    nodig: "Set no-dig zone",
    quarry: "Set quarry area",
};

/**
 * The menu for an area right-dragged on the map. Like TurtleMenu, it's a list of entries, so more things to do with an
 * area are more entries. New zones cover every Y; the Zones panel sets limits.
 */
export function AreaMenu({area, world, dimension, x, y, onClose}: Readonly<Props>) {
    const {data: zones = []} = useZones();
    const create = useCreateZone();

    const entries: MenuEntry[] = ZONE_TYPES.map((type) => ({
        kind: "item",
        key: type,
        label: ZONE_ENTRY_LABELS[type],
        title: "Covers every Y level; set limits in the Zones panel",
        onSelect: () => create.mutateAsync(zoneRequestFor(area, type, nextZoneName(zones, type), world, dimension)),
    }));

    const heading = `Area ${areaSizeText(area)} · ${areaCornersText(area)}`;
    return <ContextMenu x={x} y={y} heading={heading} entries={entries} onClose={onClose}/>;
}
