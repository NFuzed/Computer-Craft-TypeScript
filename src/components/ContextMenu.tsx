import {type KeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";

/** A row in a context menu. Items run onSelect; a separator just draws a line. */
export type MenuEntry =
    | {
    kind: "item";
    key: string;
    label: ReactNode;
    /** Muted text on the right, like a station's distance. */
    hint?: ReactNode;
    disabled?: boolean;
    /** Tooltip; says why a disabled item is disabled. */
    title?: string;
    /**
     * Runs when the item is picked; an item that's always disabled can leave it out. The menu closes straight away, unless this returns a promise: then it stays open
     * with the item busy until it settles, closing when it resolves and showing the error when it rejects.
     */
    onSelect?: () => void | Promise<unknown>;
}
    | { kind: "separator"; key: string };

interface Props {
    /** Where the menu opens, in client px: usually the right-click. It's moved back inside the window if it would overflow. */
    x: number;
    y: number;
    /** Shown above the items, like the turtle's name. */
    heading?: ReactNode;
    entries: MenuEntry[];
    onClose: () => void;
}

const EDGE_PX = 8; // gap kept between the menu and the window's edge

/**
 * A right-click menu at a point on the page. It closes on Escape, a click outside, scrolling or resizing the window, or
 * once an item is picked. Arrow keys, Home and End move between items, like a native menu.
 */
export function ContextMenu({x, y, heading, entries, onClose}: Readonly<Props>) {
    const ref = useRef<HTMLDivElement>(null);
    const [place, setPlace] = useState({left: x, top: y});
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Keep it on screen: flip left or up from the cursor when there's no room the other way
    useLayoutEffect(() => {
        const menu = ref.current;
        if (!menu) return;
        const {width, height} = menu.getBoundingClientRect();
        const left = x + width + EDGE_PX > window.innerWidth ? Math.max(EDGE_PX, x - width) : x;
        const top = y + height + EDGE_PX > window.innerHeight ? Math.max(EDGE_PX, y - height) : y;
        setPlace({left, top});
    }, [x, y]);

    // The latest onClose, so the listeners below are only added once
    const close = useRef(onClose);
    useLayoutEffect(() => {
        close.current = onClose;
    });

    useEffect(() => {
        // The menu itself takes focus when every item is disabled, so Escape still closes it
        (firstItem(ref.current) ?? ref.current)?.focus();
        const onPointerDown = (e: PointerEvent) => {
            if (!ref.current?.contains(e.target as Node)) close.current();
        };
        const onDismiss = () => close.current();
        // Capture, so a scroll inside any panel closes it too
        document.addEventListener("pointerdown", onPointerDown, true);
        window.addEventListener("scroll", onDismiss, true);
        window.addEventListener("resize", onDismiss);
        window.addEventListener("blur", onDismiss);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown, true);
            window.removeEventListener("scroll", onDismiss, true);
            window.removeEventListener("resize", onDismiss);
            window.removeEventListener("blur", onDismiss);
        };
    }, []);

    function pick(entry: Extract<MenuEntry, { kind: "item" }>) {
        if (entry.disabled || busyKey) return;
        const result = entry.onSelect?.();
        if (!(result instanceof Promise)) {
            onClose();
            return;
        }
        setBusyKey(entry.key);
        setError(null);
        result.then(
            () => close.current(),
            (e: unknown) => {
                setBusyKey(null);
                setError(e instanceof Error ? e.message : String(e));
            },
        );
    }

    function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
        if (e.key === "Escape" || e.key === "Tab") {
            e.preventDefault();
            onClose();
            return;
        }
        const items = enabledItems(ref.current);
        if (items.length === 0) return;
        const at = items.indexOf(document.activeElement as HTMLButtonElement);
        let next: number | null = null;
        if (e.key === "ArrowDown") next = (at + 1) % items.length;
        else if (e.key === "ArrowUp") next = at <= 0 ? items.length - 1 : at - 1;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = items.length - 1;
        if (next === null) return;
        e.preventDefault();
        items[next]?.focus();
    }

    return createPortal(
        <div
            ref={ref}
            className="context-menu"
            role="menu"
            tabIndex={-1}
            style={{left: place.left, top: place.top}}
            onKeyDown={onKeyDown}
            onContextMenu={(e) => e.preventDefault()}
        >
            {heading && <div className="context-menu-heading">{heading}</div>}
            {entries.map((entry) => {
                if (entry.kind === "separator") return <hr key={entry.key} className="context-menu-separator"/>;
                const busy = busyKey === entry.key;
                return (
                    <button
                        key={entry.key}
                        type="button"
                        role="menuitem"
                        className="context-menu-item"
                        disabled={entry.disabled || (busyKey !== null && !busy)}
                        aria-busy={busy || undefined}
                        title={entry.title}
                        onClick={() => pick(entry)}
                    >
                        <span>{entry.label}</span>
                        {busy && <span className="context-menu-hint">…</span>}
                        {!busy && entry.hint && <span className="context-menu-hint">{entry.hint}</span>}
                    </button>
                );
            })}
            {error && <p className="context-menu-error" role="alert">{error}</p>}
        </div>,
        document.body,
    );
}

function enabledItems(menu: HTMLElement | null): HTMLButtonElement[] {
    return menu ? [...menu.querySelectorAll<HTMLButtonElement>(".context-menu-item:not(:disabled)")] : [];
}

function firstItem(menu: HTMLElement | null): HTMLButtonElement | undefined {
    return enabledItems(menu)[0];
}
