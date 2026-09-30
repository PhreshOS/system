import { useCallback, useMemo, useRef, useState } from "react"
import { progressAt, type AppearanceTransaction } from "@phreshos/core"
import motionAcross from "./motion-across"
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

    // How the view gets to where it goes: a move to a whole view takes a motion chosen from how far
    // it goes; placing the view under a hand that drags it follows the hand at once, with none. The
    // motion on its way is kept, so a move taken during it starts from where the view is shown and
    // carries on at the speed it already has.
    const [{ views, transaction }, setState] = useState<ViewportState>({ views: origin, transaction: null, journey: null })

    const size = useRef(surface)

    size.current = surface

    const setViews = useCallback((next: ViewportOffset, glides = true) => setState(current => {

        if (!glides) return { views: next, transaction: null, journey: null }

        const now = performance.now()

        const { width, height } = size.current

        // Where the view is shown now, and how fast it moves there, in pixels a second.
        let from = { x: current.views.x * width, y: current.views.y * height }

        let speed = { x: 0, y: 0 }

        const on = current.journey

        if (on && now - on.start < on.transaction.duration) {

            const elapsed = now - on.start

            const along = progressAt(on.transaction, elapsed)

            const pace = (progressAt(on.transaction, elapsed + 8) - progressAt(on.transaction, Math.max(0, elapsed - 8))) / (elapsed >= 8 ? 16 : elapsed + 8) * 1000

            from = { x: on.from.x + (on.to.x - on.from.x) * along, y: on.from.y + (on.to.y - on.from.y) * along }

            speed = { x: (on.to.x - on.from.x) * pace, y: (on.to.y - on.from.y) * pace }
        }

        const to = { x: next.x * width, y: next.y * height }

        const path = { x: to.x - from.x, y: to.y - from.y }

        const distance = Math.hypot(path.x, path.y)

        if (distance === 0) return { views: next, transaction: null, journey: null }

        const motion = motionAcross(distance)

        // The speed it already has, in lengths of the new journey a second.
        const velocity = (speed.x * path.x + speed.y * path.y) / (distance * distance)

        const transaction: AppearanceTransaction = typeof motion.easing === "object" && "spring" in motion.easing
            ? Object.freeze({ duration: motion.duration, easing: Object.freeze({ spring: Object.freeze({ ...motion.easing.spring, velocity }) }) })
            : motion

        return { views: next, transaction, journey: { from, to, transaction, start: now } }
    }), [])

    /** Moves the view to one whole view, counted from the plane's center. */
    const moveTo = useCallback((view: ViewportOffset) => setViews({ x: within(view.x), y: within(view.y) }), [setViews])

    /** Places the view at any point of the plane in pixels, not only whole views; its center stays over the plane's outer views. */
    const place = useCallback(function (point: ViewportOffset) {

        if (!surface.width || !surface.height) return

        setViews({ x: within(point.x / surface.width), y: within(point.y / surface.height) }, false)

    }, [surface.width, surface.height, setViews])

    /** Returns the view to the plane's center. */
    const home = useCallback(() => setViews(origin), [setViews])

    // The same place in pixels, at the current size.
    const offset = useMemo<ViewportOffset>(() => ({ x: Math.round(views.x * surface.width), y: Math.round(views.y * surface.height) }), [views, surface.width, surface.height])

    // The nearest whole view from the center, which is what a person counts.
    const view = { x: Math.round(views.x), y: Math.round(views.y) }

    return { views, transaction, offset, view, surface, moveTo, place, home }
}

export type ViewportControl = ReturnType<typeof useViewportOffset>

type ViewportState = Readonly<{
    views: ViewportOffset
    transaction: AppearanceTransaction | null
    /** The glide on its way, in pixels of the plane, and when it set off. */
    journey: Readonly<{ from: ViewportOffset, to: ViewportOffset, transaction: AppearanceTransaction, start: number }> | null
}>

function within(value: number) {

    return Math.min(planeReach, Math.max(-planeReach, value))
}

const origin: ViewportOffset = Object.freeze({ x: 0, y: 0 })
