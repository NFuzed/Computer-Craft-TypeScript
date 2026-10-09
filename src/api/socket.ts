import {wsUrl} from "./client";
import {type DashboardEvent, DashboardEventSchema} from "./schemas";

export type SocketState = "connecting" | "open" | "closed";

export interface DashboardSocketOptions {
    onEvent: (event: DashboardEvent) => void;
    onStateChange?: (state: SocketState) => void;
}

const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

/**
 * Connection to /ws/dashboard that reconnects with exponential backoff (plus jitter).
 * The server sends a `snapshot` on every (re)connect, which callers treat as the source of truth.
 */
export class DashboardSocket {
    private ws: WebSocket | null = null;
    private attempt = 0;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private stopped = false;

    constructor(private readonly options: DashboardSocketOptions) {
    }

    start(): void {
        this.stopped = false;
        this.connect();
    }

    stop(): void {
        this.stopped = true;
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = null;
        this.ws?.close();
        this.ws = null;
    }

    private connect(): void {
        this.options.onStateChange?.("connecting");
        const ws = new WebSocket(wsUrl("/ws/dashboard"));
        this.ws = ws;

        ws.onopen = () => {
            this.attempt = 0;
            this.options.onStateChange?.("open");
        };

        ws.onmessage = (msg) => {
            let data: unknown;
            try {
                data = JSON.parse(String(msg.data));
            } catch {
                console.warn("[dashboard socket] non-JSON message", msg.data);
                return;
            }
            const parsed = DashboardEventSchema.safeParse(data);
            if (parsed.success) {
                this.options.onEvent(parsed.data);
            } else {
                console.warn("[dashboard socket] unrecognised message", data, parsed.error.issues);
            }
        };

        ws.onclose = () => {
            if (this.ws !== ws) return; // superseded by stop() or a newer connection
            this.ws = null;
            this.options.onStateChange?.("closed");
            if (!this.stopped) this.scheduleReconnect();
        };
    }

    private scheduleReconnect(): void {
        const exp = Math.min(MAX_BACKOFF_MS, MIN_BACKOFF_MS * 2 ** this.attempt);
        const delay = exp / 2 + Math.random() * (exp / 2); // NOSONAR: reconnect jitter, not security-sensitive
        this.attempt++;
        this.retryTimer = setTimeout(() => this.connect(), delay);
    }
}
