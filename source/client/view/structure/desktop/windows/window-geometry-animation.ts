import type { WindowRegion } from "@client/view/components/window-manager/window-geometry"
import type { AppearanceTransaction } from "@phreshos/core"
import { animate, type AnimationPlaybackControls, type MotionValue } from "motion/react"
import { motionTransition } from "@client/view/appearance/motion"

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

    constructor(
        private values: Record<Axis, MotionValue<number>>,
        private layout: Pick<Record<Axis, MotionValue<number>>, "width" | "height">
    ) {}

    stop() {

        this.complete = undefined
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

    transition(region: WindowRegion, transaction: AppearanceTransaction, complete?: () => void) {

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
    transitionSize(region: WindowRegion, transaction: AppearanceTransaction, complete?: () => void) {

        this.stop()
        this.values.x.set(region.x)
        this.values.y.set(region.y)
        this.animate(region, transaction, sizeAxes, complete)
    }

    private animate(region: WindowRegion, transaction: AppearanceTransaction, animatedAxes: readonly Axis[], complete?: () => void) {

        if (transaction.duration === 0) {
            this.set(region)
            complete?.()
            return
        }

        this.complete = complete
        this.updating = true
        const timing = JSON.stringify([transaction.duration, transaction.easing])

        // A nonzero backing viewport permits scaling to or from zero size.
        // Only these destination changes reflow content, not every tween frame.
        this.layout.width.set(region.width || Math.max(this.values.width.get(), 1))
        this.layout.height.set(region.height || Math.max(this.values.height.get(), 1))

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

        if (this.updating || this.flights.size) return
        this.settleLayout()
        const complete = this.complete
        this.complete = undefined
        complete?.()
    }

    private settleLayout() {
        this.layout.width.set(this.values.width.get())
        this.layout.height.set(this.values.height.get())
    }
}
