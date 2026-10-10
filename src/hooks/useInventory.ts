import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useEffect, useState} from "react";
import {fetchInventory, refuelTurtle, selectSlot} from "../api/client";

export const inventoryQueryKey = (turtleId: number) => ["inventory", turtleId] as const;

/** The server has no inventory event on /ws/dashboard yet, so the selected turtle's inventory is polled. */
const POLL_MS = 2_000;
/** Polls faster while waiting for the turtle to confirm a slot selection or refuel. */
const PENDING_POLL_MS = 500;
/** Gives up on a request the turtle never answered (e.g. the message was lost). */
const PENDING_TIMEOUT_MS = 10_000;

/**
 * The turtle's last reported inventory (null if it has never reported one), with ways to change its selected slot
 * and refuel it. A selection shows as `pendingSlot` until the turtle reports it back; a refuel is `refuelPending`
 * until its result arrives as `refuelResult`.
 */
export function useInventory(turtleId: number, {online}: { online: boolean }) {
    const queryClient = useQueryClient();
    const [pendingSlot, setPendingSlot] = useState<number | null>(null);
    // The refuel we last sent, and whether we stopped waiting for its result
    const [sentRefuelId, setSentRefuelId] = useState<number | null>(null);
    const [refuelTimedOut, setRefuelTimedOut] = useState(false);

    const query = useQuery({
        queryKey: inventoryQueryKey(turtleId),
        queryFn: () => fetchInventory(turtleId),
        refetchInterval: (q) => {
            // An offline turtle can't change its inventory, so its stored one is fetched once
            if (!online) return false;
            const awaitingRefuel =
                sentRefuelId != null && q.state.data?.lastRefuel?.refuelId !== sentRefuelId && !refuelTimedOut;
            return pendingSlot != null || awaitingRefuel ? PENDING_POLL_MS : POLL_MS;
        },
    });

    const lastRefuel = query.data?.lastRefuel;
    const refuelResult = sentRefuelId != null && lastRefuel?.refuelId === sentRefuelId ? lastRefuel : null;

    const invalidate = () => queryClient.invalidateQueries({queryKey: inventoryQueryKey(turtleId)});

    const select = useMutation({
        mutationFn: (slot: number) => selectSlot(turtleId, slot),
        onMutate: (slot) => setPendingSlot(slot),
        onSuccess: invalidate,
        onError: () => setPendingSlot(null),
    });

    const refuel = useMutation({
        // null burns the whole selected stack
        mutationFn: (count: number | null) => refuelTurtle(turtleId, count),
        onMutate: () => {
            setSentRefuelId(null);
            setRefuelTimedOut(false);
        },
        onSuccess: (command) => {
            setSentRefuelId(command.refuelId);
            return invalidate();
        },
    });

    const reportedSlot = query.data?.selectedSlot;
    useEffect(() => {
        if (pendingSlot == null) return;
        if (reportedSlot === pendingSlot) {
            setPendingSlot(null);
            return;
        }
        const id = setTimeout(() => setPendingSlot(null), PENDING_TIMEOUT_MS);
        return () => clearTimeout(id);
    }, [pendingSlot, reportedSlot]);

    const refuelAnswered = refuelResult != null;
    useEffect(() => {
        if (sentRefuelId == null || refuelAnswered) return;
        const id = setTimeout(() => setRefuelTimedOut(true), PENDING_TIMEOUT_MS);
        return () => clearTimeout(id);
    }, [sentRefuelId, refuelAnswered]);

    return {
        ...query,
        pendingSlot,
        select,
        refuel,
        refuelPending: refuel.isPending || (sentRefuelId != null && !refuelAnswered && !refuelTimedOut),
        refuelResult,
        refuelTimedOut: refuelTimedOut && !refuelAnswered,
    };
}
