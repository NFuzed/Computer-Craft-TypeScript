import {useQueryClient} from "@tanstack/react-query";
import {useEffect, useState} from "react";
import type {TurtleStatus} from "../api/schemas";
import {DashboardSocket, type SocketState} from "../api/socket";
import {applyDashboardEvent, turtlesQueryKey} from "./useTurtles";

/** Opens /ws/dashboard for the lifetime of the component and feeds events into the turtles query cache. */
export function useDashboardSocket(): SocketState {
    const queryClient = useQueryClient();
    const [state, setState] = useState<SocketState>("connecting");

    useEffect(() => {
        const socket = new DashboardSocket({
            onStateChange: setState,
            onEvent: (event) => {
                queryClient.setQueryData<TurtleStatus[]>(turtlesQueryKey, (prev) => applyDashboardEvent(prev, event));
            },
        });
        socket.start();
        return () => socket.stop();
    }, [queryClient]);

    return state;
}
