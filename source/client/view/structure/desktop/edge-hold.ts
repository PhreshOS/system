import { useCallback } from "react"
import { useReducedMotion } from "@libs/react-motion"
import { planeReach } from "@client/view/components/window-manager/window-geometry"
import motionAcross from "./motion-across"
import { type ViewportControl } from "./viewport-offset"

export type Direction = Readonly<{ x: number, y: number }>

/**
 * Takes the view one whole view in a direction, when the plane goes on there. It answers how long
 * the view takes to get there, so whoever holds it there waits for it, or null when there is nowhere
 * further to go.
 */
export function useViewTravel(viewport: ViewportControl) {

    const reducedMotion = useReducedMotion()

    const { view, moveTo, surface } = viewport

    return useCallback(function (direction: Direction) {

        const next = { x: view.x + direction.x, y: view.y + direction.y }

        if (Math.abs(next.x) > planeReach || Math.abs(next.y) > planeReach || (next.x === view.x && next.y === view.y)) return null

        moveTo(next)

        return reducedMotion ? 0 : motionAcross(Math.hypot(direction.x * surface.width, direction.y * surface.height)).duration

    }, [view.x, view.y, moveTo, reducedMotion, surface.width, surface.height])
}

/** Which edges of a box a point is held against, within 16 pixels: -1, 0 or 1 in each direction. */
export function against(x: number, y: number, width: number, height: number): Direction {

    return {
        x: x <= 16 ? -1 : x >= width - 16 ? 1 : 0,
        y: y <= 16 ? -1 : y >= height - 16 ? 1 : 0
    }
}

/**
 * Something held against an edge of the screen takes the view that way: after 700 milliseconds, one
 * whole view; then, once the view has arrived and a half second has passed, another, for as long as
 * it stays there. Where the plane goes no further, it says so, so the one holding can show it.
 */
export class EdgeHold {

    private direction: Direction = { x: 0, y: 0 }

    private timer = 0

    private blocked = false

    public constructor(
        private readonly travel: (direction: Direction) => number | null | undefined,
        private readonly onBlocked?: (blocked: boolean) => void
    ) {}

    /** Where it is held now; a new edge starts the wait again, and no edge stops it. */
    public update(direction: Direction) {

        if (direction.x === this.direction.x && direction.y === this.direction.y) return

        this.stop()

        this.direction = direction

        if (direction.x || direction.y) this.timer = window.setTimeout(() => this.hold(), 700)
    }

    public stop() {

        if (this.timer) clearTimeout(this.timer)

        this.timer = 0

        this.direction = { x: 0, y: 0 }

        if (this.blocked) {

            this.blocked = false

            this.onBlocked?.(false)
        }
    }

    private hold() {

        const took = this.travel(this.direction)

        if (took === null || took === undefined) {

            this.timer = 0

            this.blocked = true

            this.onBlocked?.(true)

            return
        }

        this.timer = window.setTimeout(() => this.hold(), took + 500)
    }
}
