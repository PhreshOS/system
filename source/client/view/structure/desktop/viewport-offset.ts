import { useCallback, useState } from "react"
import { planeReach, type ViewportOffset, type WindowSurfaceSize } from "@client/view/components/window-manager/window-geometry"

/**
 * Where this Desktop looks on the plane of standard Windows: the point shown at
 * the center of its view. It belongs to this connection alone: it starts at zero
 * and is not stored.
 */
export default function useViewportOffset(surface: WindowSurfaceSize) {

    const [offset, setOffset] = useState<ViewportOffset>(origin)

    /** Moves the view to one whole view, counted from the plane's center. */
    const moveTo = useCallback(function (view: ViewportOffset) {

        if (!surface.width || !surface.height) return

        setOffset({ x: within(view.x, planeReach) * surface.width, y: within(view.y, planeReach) * surface.height })

    }, [surface.width, surface.height])

    /** Places the view at any point of the plane, not only whole views; its center stays over the plane's outer views. */
    const place = useCallback((point: ViewportOffset) => setOffset({
        x: Math.round(within(point.x, planeReach * surface.width)),
        y: Math.round(within(point.y, planeReach * surface.height))
    }), [surface.width, surface.height])

    /** Returns the view to the plane's center. */
    const home = useCallback(() => setOffset(origin), [])

    // The nearest whole view from the center, which is what a person counts.
    const view = { x: surface.width ? Math.round(offset.x / surface.width) : 0, y: surface.height ? Math.round(offset.y / surface.height) : 0 }

    return { offset, view, surface, moveTo, place, home }
}

export type ViewportControl = ReturnType<typeof useViewportOffset>

function within(value: number, reach: number) {

    return Math.min(reach, Math.max(-reach, value))
}

const origin: ViewportOffset = Object.freeze({ x: 0, y: 0 })
