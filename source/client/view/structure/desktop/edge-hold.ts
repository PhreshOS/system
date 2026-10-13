import { useCallback } from "react"
import { useReducedMotion } from "@libs/react-motion"
import { planeReach } from "@client/view/components/window-manager/window-geometry"
import { timing, useAppearance } from "@phreshos/react-ui"
import { type Viewport } from "./viewport-offset"

export type Direction = Readonly<{ x: number, y: number }>

/**
 * Takes the view one whole view in a direction, when the plane goes on there. It answers how long
 * the view takes to get there, so whoever holds it there waits for it, or null when there is nowhere
 * further to go.
 */
export function useViewTravel(viewport: Viewport) {

    const reducedMotion = useReducedMotion()

    const tempo = useAppearance().tempo

    const { view, moveTo, size } = viewport

    return useCallback(function (direction: Direction) {

        const next = { x: view.x + direction.x, y: view.y + direction.y }

        if (Math.abs(next.x) > planeReach || Math.abs(next.y) > planeReach || (next.x === view.x && next.y === view.y)) return null

        moveTo(next)

        return reducedMotion ? 0 : timing("view", { distance: Math.hypot(direction.x * size.width, direction.y * size.height), tempo }).duration

    }, [view.x, view.y, moveTo, reducedMotion, tempo, size.width, size.height])
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
 *
 * A hold that can also settle there, as a Window that snaps to the edge, first waits 300 milliseconds
 * to settle and only then 700 more to travel, so a hand that only carries it near the edge does
 * neither. Once settled, it stays so along the edges until it leaves them.
 */
export class EdgeHold {

    private direction: Direction = { x: 0, y: 0 }

    private timer = 0

    private blocked = false

    /** The edges it has settled against, or null while it has not. */
    public settled: Direction | null = null

    public constructor(
        private readonly travel: (direction: Direction) => number | null | undefined,
        private readonly events: Readonly<{
            onBlocked?: (blocked: boolean) => void
            /** Given, the hold settles before it travels, and says when it settles or leaves. */
            onSettled?: (settled: Direction | null) => void
        }> = {}
    ) {}

    /** Where it is held now; a new edge starts the wait again, and no edge stops it. */
    public update(direction: Direction) {

        if (direction.x === this.direction.x && direction.y === this.direction.y) return

        if (!direction.x && !direction.y) return this.stop()

        this.pause()

        this.direction = direction

        if (!this.events.onSettled) this.timer = window.setTimeout(() => this.hold(), 700)

        else if (this.settled) {

            this.settle()

            this.timer = window.setTimeout(() => this.hold(), 700)
        }

        else this.timer = window.setTimeout(() => {

            this.settle()

            this.timer = window.setTimeout(() => this.hold(), 700)

        }, 300)
    }

    public stop() {

        this.pause()

        this.direction = { x: 0, y: 0 }

        if (this.settled) {

            this.settled = null

            this.events.onSettled?.(null)
        }
    }

    /** Stops waiting and shows the plane's end no more, still settled. */
    private pause() {

        if (this.timer) clearTimeout(this.timer)

        this.timer = 0

        if (this.blocked) {

            this.blocked = false

            this.events.onBlocked?.(false)
        }
    }

    private settle() {

        this.settled = this.direction

        this.events.onSettled?.(this.settled)
    }

    private hold() {

        const took = this.travel(this.direction)

        if (took === null || took === undefined) {

            this.timer = 0

            this.blocked = true

            this.events.onBlocked?.(true)

            return
        }

        this.timer = window.setTimeout(() => this.hold(), took + 500)
    }
}
