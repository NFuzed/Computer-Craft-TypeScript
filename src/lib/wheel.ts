/** Zoom per wheel pixel; one mouse notch (100px) zooms by about 16%. Shared so both maps zoom at the same rate. */
export const WHEEL_ZOOM_SPEED = 0.0015;

/** Wheel delta in pixels; Firefox reports lines (deltaMode 1) for mouse wheels. */
export function wheelPixels(e: WheelEvent): number {
    if (e.deltaMode === 1) return e.deltaY * 16;
    if (e.deltaMode === 2) return e.deltaY * 400;
    return e.deltaY;
}
