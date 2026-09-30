import { createContext, useLayoutEffect, useRef, type ReactNode } from "react"
import { animate, motion, useMotionValue, type MotionValue } from "motion/react"
import { type Transaction } from "@phreshos/core"
import { useReducedMotion } from "@libs/react-motion"
import { motionTransition } from "@client/view/appearance/motion"
import { type ViewportOffset, type WindowSurfaceSize } from "@client/view/components/window-manager/window-geometry"

export type PlaneSlideValue = Readonly<{ x: MotionValue<number>, y: MotionValue<number> }>

/**
 * How far the shown view is from the grid of whole views, in pixels: zero on a whole view, and a
 * part of one when the Desktop looks between two, so a Window can find the edges of its own view.
 * It changes on every step of a dragged view, so it is a store a Window reads and follows, not a
 * value that would redraw every Window on each step: a Window redraws only when its own margins do.
 */
export class CellShiftStore {

    private value: Readonly<{ x: number, y: number }> = Object.freeze({ x: 0, y: 0 })

    private readonly listeners = new Set<() => void>()

    public readonly get = () => this.value

    public readonly subscribe = (listener: () => void) => {
        this.listeners.add(listener)
        return () => { this.listeners.delete(listener) }
    }

    /**
     * Takes the new shift while the Desktop draws, before its Windows do, so every Window draws its
     * new place with the shift of the same moment. A Window that paints its margins from a place and a
     * shift of two different moments flips a margin and back, and the Program inside feels both.
     */
    public take(next: Readonly<{ x: number, y: number }>) {
        if (next.x === this.value.x && next.y === this.value.y) return
        this.value = Object.freeze({ ...next })
    }

    /** Tells the Windows that did not draw again, once the Desktop's drawing is done. */
    public announce() {
        for (const listener of this.listeners) listener()
    }
}

export const ViewCellShift = createContext(new CellShiftStore())

/** The plane's current glide, for a Window held by a hand, which stays under the hand instead. */
export const PlaneSlideContext = createContext<PlaneSlideValue | null>(null)

/**
 * When the view moves, what lives on the plane glides there on the motion the move was given instead of
 * jumping. Everything is already drawn where the view now is, and the Desktop announced the new
 * view at once; this only shifts the drawing back to where it was, then lets it go, so one
 * transform moves the whole plane. A resize changes the pixels of the view, not where it looks,
 * so it does not glide, and neither does a view placed under a hand that drags it.
 */
export function usePlaneSlide(views: ViewportOffset, transaction: Transaction | null, surface: WindowSurfaceSize): PlaneSlideValue {

    const x = useMotionValue(0)

    const y = useMotionValue(0)

    const reduced = useReducedMotion()

    const previous = useRef(views)

    useLayoutEffect(() => {

        const from = previous.current

        previous.current = views

        const moved = { x: (views.x - from.x) * surface.width, y: (views.y - from.y) * surface.height }

        if (!moved.x && !moved.y) return

        // A view placed under a dragging hand follows it directly; the hand is already smooth.
        if (reduced || !transaction) {

            x.set(0)

            y.set(0)

            return
        }

        // A glide still on its way continues from where it is shown.
        x.set(x.get() + moved.x)

        y.set(y.get() + moved.y)

        const timing = motionTransition(transaction)

        const across = animate(x, 0, timing)

        const down = animate(y, 0, timing)

        return () => { across.stop(); down.stop() }

    }, [views.x, views.y])

    return { x, y }
}

/** Holds what moves with the plane, so the view's glide moves it as one. */
export function PlaneSlide({ slide, children }: Readonly<{ slide: PlaneSlideValue, children: ReactNode }>) {

    return <motion.div data-plane-slide="" className="pointer-events-none absolute inset-0" style={{ x: slide.x, y: slide.y }}>{children}</motion.div>
}
