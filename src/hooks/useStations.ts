import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {createStation, deleteStation, fetchStations} from "../api/client";
import type {Station, StationRequest} from "../api/schemas";

export const stationsQueryKey = ["stations"] as const;

/** Stations only change from the dashboard, so they're refetched now and then rather than polled quickly. */
const STATIONS_POLL_MS = 30_000;

/** Every station, sorted by name. */
export function useStations() {
    return useQuery({
        queryKey: stationsQueryKey,
        queryFn: fetchStations,
        refetchInterval: STATIONS_POLL_MS,
        select: (stations: Station[]) => [...stations].sort((a, b) => a.name.localeCompare(b.name)),
    });
}

/** POSTs a new station and adds it to the cached list. */
export function useCreateStation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (station: StationRequest) => createStation(station),
        onSuccess: (station) => {
            queryClient.setQueryData<Station[]>(stationsQueryKey, (prev) => [...(prev ?? []), station]);
        },
    });
}

/** DELETEs a station and drops it from the cached list. */
export function useDeleteStation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (stationId: number) => deleteStation(stationId),
        onSuccess: (_, stationId) => {
            queryClient.setQueryData<Station[]>(stationsQueryKey, (prev) =>
                prev?.filter((s) => s.stationId !== stationId),
            );
        },
    });
}
