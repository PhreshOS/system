import type { WindowRegion } from "@client/view/components/window-manager/window-geometry"
import type { AppearanceTransaction } from "@phreshos/core"
import { animate, type AnimationPlaybackControls, type MotionValue } from "motion/react"
import { motionTransition } from "@client/view/appearance/motion"

const axes = ["x", "y", "width", "height"] as const
type Axis = typeof axes[number]
type Flight = {
    target: number
    timing: string
    control?: AnimationPlaybackControls
}

/** Retargets geometry without interrupting axes that are already travelling to their destination. */
export class WindowGeometryAnimation {

    private flights = new Map<Axis, Flight>()
    private complete?: () => void
    private updating = false

    constructor(private values: Record<Axis, MotionValue<number>>) {}

    stop() {

        this.complete = undefined
        const flights = [...this.flights.values()]
        this.flights.clear()
        for (const flight of flights) flight.control?.stop()
    }

    set(region: WindowRegion) {

        this.stop()
        for (const axis of axes) this.values[axis].set(region[axis])
    }

    transition(region: WindowRegion, transaction: AppearanceTransaction, complete?: () => void) {

        if (transaction.duration === 0) {
            this.set(region)
            complete?.()
            return
        }

        this.complete = complete
        this.updating = true
        const timing = JSON.stringify([transaction.duration, transaction.easing])

        for (const axis of axes) {

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
        const complete = this.complete
        this.complete = undefined
        complete?.()
    }
}
