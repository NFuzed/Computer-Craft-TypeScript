import {type QueryClient, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useEffect, useState} from "react";
import {fetchTurtle, fetchTurtles, renameTurtle, seedTurtle, sendCommand} from "../api/client";
import type {Command, DashboardEvent, SeedRequest, TurtleCommand, TurtleStatus} from "../api/schemas";
import {inventoryQueryKey} from "./useInventory";
import {worldMapQueryKey} from "./useWorldMap";

export const turtlesQueryKey = ["turtles"] as const;

/** How often to poll REST while the live socket is down. */
const FALLBACK_POLL_MS = 5_000;

/**
 * The turtle list. REST provides the initial data; while the dashboard socket is open its events are
 * written straight into this query's cache (see useDashboardSocket), so polling only runs as a fallback.
 */
export function useTurtles({live}: { live: boolean }) {
    return useQuery({
        queryKey: turtlesQueryKey,
        queryFn: fetchTurtles,
        refetchInterval: live ? false : FALLBACK_POLL_MS,
        select: sortTurtles,
    });
}

export function useTurtle(id: number | null, {live}: { live: boolean }) {
    const query = useTurtles({live});
    return {...query, data: id == null ? undefined : query.data?.find((t) => t.turtleId === id)};
}

/** POSTs a position seed and shows it as pending on the turtle until the turtle acknowledges it. */
export function useSeedTurtle(turtleId: number) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (seed: SeedRequest) => seedTurtle(turtleId, seed),
        onSuccess: (pendingSeed) => {
            queryClient.setQueryData<TurtleStatus[]>(turtlesQueryKey, (prev) =>
                upsert(prev ?? [], turtleId, (t) => ({...t, pendingSeed})),
            );
        },
    });
}

/** PUTs a new label and shows it as pending on the turtle until the turtle registers with it. */
export function useRenameTurtle(turtleId: number) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (label: string | null) => renameTurtle(turtleId, label),
        onSuccess: (status) => storeStatus(queryClient, status),
    });
}

/** Polls the turtle this often while waiting for a command's result. */
const COMMAND_POLL_MS = 500;
/** Gives up on a command the turtle never answered (e.g. it arrived while the previous one was still running). */
const COMMAND_TIMEOUT_MS = 10_000;

/**
 * Sends commands to a turtle. A command is `pending` until the turtle reports a `lastCommand` with its commandId, which
 * becomes `result`. While waiting, the turtle is polled so its position and the result show up quickly, and its
 * inventory is refreshed once the result arrives.
 */
export function useTurtleCommand(turtle: TurtleStatus) {
    const {turtleId} = turtle;
    const queryClient = useQueryClient();
    // The command we last sent, and whether we stopped waiting for its result
    const [sent, setSent] = useState<TurtleCommand | null>(null);
    const [timedOut, setTimedOut] = useState(false);

    const mutation = useMutation({
        mutationFn: (command: Command) => sendCommand(turtleId, command),
        onMutate: () => {
            setSent(null);
            setTimedOut(false);
        },
        onSuccess: setSent,
    });

    const result = sent != null && turtle.lastCommand?.commandId === sent.commandId ? turtle.lastCommand : null;
    const awaiting = sent != null && result == null && !timedOut;

    useEffect(() => {
        if (!awaiting) return;
        const poll = setInterval(() => {
            fetchTurtle(turtleId)
                .then((status) => storeStatus(queryClient, status))
                .catch(() => undefined); // the next poll (or the timeout) deals with it
        }, COMMAND_POLL_MS);
        const timeout = setTimeout(() => setTimedOut(true), COMMAND_TIMEOUT_MS);
        return () => {
            clearInterval(poll);
            clearTimeout(timeout);
        };
    }, [awaiting, turtleId, queryClient]);

    // Digging, placing, dropping and sucking change the inventory, and moving burns fuel. The turtle also reports what's
    // around it before sending the result, so the world map already has the cells it can now see.
    const resultId = result?.commandId;
    useEffect(() => {
        if (resultId == null) return;
        void queryClient.invalidateQueries({queryKey: inventoryQueryKey(turtleId)});
        void queryClient.invalidateQueries({queryKey: worldMapQueryKey});
    }, [resultId, turtleId, queryClient]);

    let optionalAwaiting = awaiting ? sent.command : null;
    return {
        send: (command: Command) => mutation.mutate(command),
        /** The command being sent or waited on, if any. */
        pendingCommand: mutation.isPending ? mutation.variables : optionalAwaiting,
        result,
        timedOut: timedOut && result == null ? sent?.command ?? null : null,
        error: mutation.error,
    };
}

/** Replaces a turtle's entry in the cached turtle list with a status fresh from the server. */
function storeStatus(queryClient: QueryClient, status: TurtleStatus) {
    queryClient.setQueryData<TurtleStatus[]>(turtlesQueryKey, (prev) =>
        upsert(prev ?? [], status.turtleId, () => status),
    );
}

function sortTurtles(turtles: TurtleStatus[]): TurtleStatus[] {
    return [...turtles].sort((a, b) => Number(b.online) - Number(a.online) || a.turtleId - b.turtleId);
}

function emptyStatus(turtleId: number): TurtleStatus {
    return {
        turtleId,
        label: null,
        online: false,
        lastSeen: null,
        position: null,
        pendingSeed: null,
        pendingLabel: null,
        equipment: null,
        lastCommand: null
    };
}

function upsert(
    turtles: TurtleStatus[],
    turtleId: number,
    update: (t: TurtleStatus) => TurtleStatus,
): TurtleStatus[] {
    const idx = turtles.findIndex((t) => t.turtleId === turtleId);
    if (idx === -1) return [...turtles, update(emptyStatus(turtleId))];
    const next = [...turtles];
    next[idx] = update(turtles[idx]!);
    return next;
}

/** Pure reducer applying one /ws/dashboard event to the cached turtle list. */
export function applyDashboardEvent(turtles: TurtleStatus[] | undefined, event: DashboardEvent): TurtleStatus[] {
    if (event.type === "snapshot") return event.turtles;

    const current = turtles ?? [];
    const now = Math.floor(Date.now() / 1000);

    switch (event.type) {
        case "turtle_connected":
            // Mirrors FleetService.register: the turtle's own label is authoritative, and registering with the
            // pending label acknowledges the rename
            return upsert(current, event.turtleId, (t) => ({
                ...t,
                label: event.label,
                online: true,
                lastSeen: now,
                pendingLabel: t.pendingLabel?.label === event.label ? null : t.pendingLabel,
            }));
        case "turtle_disconnected":
            return upsert(current, event.turtleId, (t) => ({...t, online: false}));
        case "position_update": {
            const {x, y, z, heading, world, dimension, seedId, ts} = event;
            return upsert(current, event.turtleId, (t) => ({
                ...t,
                lastSeen: Math.max(t.lastSeen ?? 0, ts),
                position: {x, y, z, heading, world, dimension, ts},
                // Mirrors SeedStore.acknowledge: only the matching seedId clears it, so an old ack can't clear a newer seed
                pendingSeed: seedId != null && t.pendingSeed?.seedId === seedId ? null : t.pendingSeed,
            }));
        }
    }
}
