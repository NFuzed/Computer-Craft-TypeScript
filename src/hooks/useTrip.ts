import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useEffect} from "react";
import {cancelGoto, fetchTrip, fetchTurtle, startGoto} from "../api/client";
import {type GotoRequest, type Trip, TripStatuses} from "../api/schemas";
import {inventoryQueryKey} from "./useInventory";
import {storeStatus} from "./useTurtles";
import {worldMapQueryKey} from "./useWorldMap";

export const tripQueryKey = (turtleId: number) => ["trip", turtleId] as const;

/** How often to check on a trip, and the turtle's position, while it's moving. */
const TRIP_POLL_MS = 1_000;

/**
 * The turtle's current or last trip, and sending it somewhere or stopping it. While a trip is moving it's polled, and so
 * is the turtle, so the map follows it. When the trip ends its inventory (fuel) and the world map are refreshed.
 */
export function useTrip(turtleId: number) {
    const queryClient = useQueryClient();
    const key = tripQueryKey(turtleId);

    const query = useQuery({
        queryKey: key,
        queryFn: () => fetchTrip(turtleId),
        refetchInterval: (q) => (q.state.data?.status === TripStatuses.MOVING ? TRIP_POLL_MS : false),
    });
    const trip = query.data ?? null;
    const moving = trip?.status === TripStatuses.MOVING;

    useEffect(() => {
        if (!moving) return;
        const poll = setInterval(() => {
            fetchTurtle(turtleId)
                .then((status) => storeStatus(queryClient, status))
                .catch(() => undefined); // the next poll deals with it
        }, TRIP_POLL_MS);
        return () => clearInterval(poll);
    }, [moving, turtleId, queryClient]);

    // Refresh what the trip changed once it ends (also when the turtle stopped part-way)
    const endedId = trip && !moving ? trip.tripId : null;
    useEffect(() => {
        if (endedId == null) return;
        void queryClient.invalidateQueries({queryKey: inventoryQueryKey(turtleId)});
        void queryClient.invalidateQueries({queryKey: worldMapQueryKey});
        fetchTurtle(turtleId)
            .then((status) => storeStatus(queryClient, status))
            .catch(() => undefined);
    }, [endedId, turtleId, queryClient]);

    const store = (next: Trip) => queryClient.setQueryData(key, next);
    const go = useMutation({mutationFn: (goal: GotoRequest) => startGoto(turtleId, goal), onSuccess: store});
    const cancel = useMutation({mutationFn: () => cancelGoto(turtleId), onSuccess: store});

    return {trip, moving, go, cancel};
}
