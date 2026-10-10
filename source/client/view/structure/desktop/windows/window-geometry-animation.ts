import type { WindowRegion } from "@client/view/components/window-manager/window-geometry"
import type { Transaction } from "@phreshos/core"
import { animate, type AnimationPlaybackControls, type MotionValue } from "motion/react"
import { motionTransition } from "@client/view/appearance/motion"
import { afterDrawn } from "../drawn"

const axes = ["x", "y", "width", "height"] as const
const sizeAxes = ["width", "height"] as const
type Axis = typeof axes[number]
type Flight = {
    target: number
    timing: string
    control?: AnimationPlaybackControls
}

/** Interpolates visible geometry while the viewport is laid out at its destination size. */
export class WindowGeometryAnimation {

    private flights = new Map<Axis, Flight>()
    private complete?: () => void
    private updating = false
    private waiting: (() => void) | null = null

    constructor(
        private values: Record<Axis, MotionValue<number>>,
        private layout: Pick<Record<Axis, MotionValue<number>>, "width" | "height">
    ) {}

    stop() {

        this.complete = undefined
        this.cancelWait()
        const flights = [...this.flights.values()]
        this.flights.clear()
        for (const flight of flights) flight.control?.stop()
        this.settleLayout()
    }

    set(region: WindowRegion) {

        this.stop()
        for (const axis of axes) this.values[axis].set(region[axis])
        this.settleLayout()
    }

    transition(region: WindowRegion, transaction: Transaction, complete?: () => void) {

        this.animate(region, transaction, axes, complete)
    }

    /** Moves directly while preserving an in-flight size transition. */
    setPosition(position: Pick<WindowRegion, "x" | "y">) {

        for (const axis of ["x", "y"] as const) {
            const flight = this.flights.get(axis)
            this.flights.delete(axis)
            flight?.control?.stop()
            this.values[axis].set(position[axis])
        }

        this.finish()
    }

    /** Starts from the visible size while the pointer immediately owns position. */
    transitionSize(region: WindowRegion, transaction: Transaction, complete?: () => void) {

        this.stop()
        this.values.x.set(region.x)
        this.values.y.set(region.y)
        this.animate(region, transaction, sizeAxes, complete)
    }

    private animate(region: WindowRegion, transaction: Transaction, animatedAxes: readonly Axis[], complete?: () => void) {

        if (transaction.duration === 0) {
            this.set(region)
            complete?.()
            return
        }

        this.complete = complete
        this.cancelWait()

        // A nonzero backing viewport permits scaling to or from zero size.
        // Only these destination changes reflow content, not every tween frame.
        const width = region.width || Math.max(this.values.width.get(), 1)
        const height = region.height || Math.max(this.values.height.get(), 1)
        const reflows = !this.flights.size && (width !== this.layout.width.get() || height !== this.layout.height.get())
        this.layout.width.set(width)
        this.layout.height.set(height)

        // Starting from rest, the tween waits for the content laid out anew to be drawn; a running
        // one retargets at once.
        if (reflows) {
            let drawn = false
            const cancel = afterDrawn(() => {
                drawn = true
                this.waiting = null
                this.fly(region, transaction, animatedAxes)
            })
            if (!drawn) this.waiting = cancel
            return
        }

        this.fly(region, transaction, animatedAxes)
    }

    private fly(region: WindowRegion, transaction: Transaction, animatedAxes: readonly Axis[]) {

        this.updating = true
        const timing = JSON.stringify([transaction.duration, transaction.easing])

        for (const axis of animatedAxes) {

            const previous = this.flights.get(axis)
            if (previous?.target === region[axis] && previous.timing === timing) continue

            this.flights.delete(axis)
            previous?.control?.stop()

            const value = this.values[axis]
            if (value.get() === region[axis]) continue

            const flight: Flight = { target: region[axis], timing }
            this.flights.set(axis, flight)
            flight.control = animate(value, region[axis], {
                ...motionTransition(transaction),
                onComplete: () => {
                    if (this.flights.get(axis) !== flight) return
                    this.flights.delete(axis)
                    this.finish()
                }
            })
        }

        this.updating = false
        this.finish()
    }

    private finish() {

        if (this.updating || this.waiting || this.flights.size) return
        this.settleLayout()
        const complete = this.complete
        this.complete = undefined
        complete?.()
    }

    private cancelWait() {
        this.waiting?.()
        this.waiting = null
    }

    private settleLayout() {
        this.layout.width.set(this.values.width.get())
        this.layout.height.set(this.values.height.get())
    }
}
