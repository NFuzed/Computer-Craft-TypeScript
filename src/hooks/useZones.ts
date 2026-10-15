import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {createZone, deleteZone, fetchZones, updateZone} from "../api/client";
import type {Zone, ZoneRequest} from "../api/schemas";

export const zonesQueryKey = ["zones"] as const;

/** Zones only change from the dashboard, so like stations they're refetched now and then rather than polled quickly. */
const ZONES_POLL_MS = 30_000;

/** Every zone, sorted by name. */
export function useZones() {
    return useQuery({
        queryKey: zonesQueryKey,
        queryFn: fetchZones,
        refetchInterval: ZONES_POLL_MS,
        select: (zones: Zone[]) => [...zones].sort((a, b) => a.name.localeCompare(b.name)),
    });
}

/** POSTs a new zone and adds it to the cached list. */
export function useCreateZone() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (zone: ZoneRequest) => createZone(zone),
        onSuccess: (zone) => {
            queryClient.setQueryData<Zone[]>(zonesQueryKey, (prev) => [...(prev ?? []), zone]);
        },
    });
}

/** PUTs a zone's new settings and swaps it in the cached list. */
export function useUpdateZone() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({zoneId, zone}: { zoneId: number; zone: ZoneRequest }) => updateZone(zoneId, zone),
        onSuccess: (zone) => {
            queryClient.setQueryData<Zone[]>(zonesQueryKey, (prev) =>
                prev?.map((z) => (z.zoneId === zone.zoneId ? zone : z)),
            );
        },
    });
}

/** DELETEs a zone and drops it from the cached list. */
export function useDeleteZone() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (zoneId: number) => deleteZone(zoneId),
        onSuccess: (_, zoneId) => {
            queryClient.setQueryData<Zone[]>(zonesQueryKey, (prev) => prev?.filter((z) => z.zoneId !== zoneId));
        },
    });
}
