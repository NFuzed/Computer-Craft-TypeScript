import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {fetchTurtles, renameTurtle, seedTurtle} from "../api/client";
import type {DashboardEvent, SeedRequest, TurtleStatus} from "../api/schemas";

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
        onSuccess: (status) => {
            queryClient.setQueryData<TurtleStatus[]>(turtlesQueryKey, (prev) =>
                upsert(prev ?? [], turtleId, () => status),
            );
        },
    });
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
        pendingLabel: null
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
