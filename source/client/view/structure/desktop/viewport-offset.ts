import { useCallback, useMemo, useState } from "react"
import { planeReach, type ViewportOffset, type WindowSurfaceSize } from "@client/view/components/window-manager/window-geometry"

/**
 * Where this Desktop looks on the plane of standard Windows: the point shown at
 * the center of its view. It belongs to this connection alone: it starts at zero
 * and is not stored.
 *
 * It is kept in views, not pixels, so it means the same place whatever size the
 * view has: a Desktop that is resized, or rescaled, keeps looking at the same
 * Windows. Its pixels follow from the current size.
 */
export default function useViewportOffset(surface: WindowSurfaceSize) {

    const [views, setViews] = useState<ViewportOffset>(origin)

    /** Moves the view to one whole view, counted from the plane's center. */
    const moveTo = useCallback((view: ViewportOffset) => setViews({ x: within(view.x), y: within(view.y) }), [])

    /** Places the view at any point of the plane in pixels, not only whole views; its center stays over the plane's outer views. */
    const place = useCallback(function (point: ViewportOffset) {

        if (!surface.width || !surface.height) return

        setViews({ x: within(point.x / surface.width), y: within(point.y / surface.height) })

    }, [surface.width, surface.height])

    /** Returns the view to the plane's center. */
    const home = useCallback(() => setViews(origin), [])

    // The same place in pixels, at the current size.
    const offset = useMemo<ViewportOffset>(() => ({ x: Math.round(views.x * surface.width), y: Math.round(views.y * surface.height) }), [views, surface.width, surface.height])

    // The nearest whole view from the center, which is what a person counts.
    const view = { x: Math.round(views.x), y: Math.round(views.y) }

    return { views, offset, view, surface, moveTo, place, home }
}

export type ViewportControl = ReturnType<typeof useViewportOffset>

function within(value: number) {

    return Math.min(planeReach, Math.max(-planeReach, value))
}

const origin: ViewportOffset = Object.freeze({ x: 0, y: 0 })
