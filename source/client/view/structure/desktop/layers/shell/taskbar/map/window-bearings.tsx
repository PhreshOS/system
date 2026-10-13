import { type CSSProperties } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Surface, useAppearance, useColor, useScale, useTiming } from "@phreshos/react-ui"
import { ChevronRight } from "@phreshos/react-ui/icons"
import { motionTransition } from "@client/view/appearance/motion"
import { type PaintMargins } from "@client/view/components/window-manager/window-geometry"
import { type Viewport } from "../../../../viewport-offset"
import { type MappedWindow } from "./map-control"

type Edge = "left" | "right" | "top" | "bottom"

/** A Window outside the view, as a mark on the edge of the screen that faces it. */
type Bearing = { identity: string, icon: string, focused: boolean, x: number, y: number, angle: number, edge: Edge }

/**
 * While the Map is carried, every Window outside the view shows at the edge of the screen that faces
 * it: its icon, as the map shows it, with a small arrow toward it, where a line from the middle of the
 * screen to the Window's middle crosses the room the Taskbar leaves. It glides along the edges as the
 * view crosses, and leaves once the Window is in view, so the hand knows which way to go to reach it.
 * Marks that would cover each other stand side by side along their edge. They only show the way;
 * nothing is pressed there.
 */
export default function WindowBearings({ shown, windows, viewport, margins, reducedMotion, zIndex }: WindowBearingsProps) {

    const space = useScale(useAppearance().spacing)

    const fade = motionTransition(useTiming()("change"), reducedMotion)

    const icon = space.medium + space.xsmall, card = icon + space.xsmall * 2, arrow = space.medium, gap = space.xsmall

    const primary = useColor("primary").base

    const bearings = shown ? bearingsOf(windows, viewport, margins, { card, arrow, inset: space.medium, gap }) : []

    // The marks travel with the view: the same motion while it glides, at once otherwise.
    const glide = viewport.transaction && !reducedMotion ? motionTransition(viewport.transaction) : { duration: 0 }

    return <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ zIndex }}>

        <AnimatePresence>
            {bearings.map(bearing => <motion.div key={bearing.identity} className="absolute left-0 top-0"
                initial={{ opacity: 0, x: bearing.x - card / 2, y: bearing.y - card / 2 }}
                animate={{ opacity: 1, x: bearing.x - card / 2, y: bearing.y - card / 2, transition: { x: glide, y: glide, opacity: fade } }}
                exit={{ opacity: 0, transition: fade }}
                style={{ width: card, height: card }}>

                <Surface color={bearing.focused ? "primary:soft" : "secondary:subtle"} className="grid place-items-center" style={{ width: card, height: card }}>
                    <img src={bearing.icon} alt="" draggable={false} className="object-contain" style={{ width: icon, height: icon }} />
                </Surface>

                {/* Turned about the card's middle, the arrow stands a little apart from it on the Window's side. */}
                <motion.div className="absolute inset-0" initial={false} animate={{ rotate: bearing.angle }} transition={glide}>
                    <ChevronRight strokeWidth={3} style={{ position: "absolute", left: card + gap, top: (card - arrow) / 2, width: arrow, height: arrow, color: primary }} />
                </motion.div>

            </motion.div>)}
        </AnimatePresence>

    </div>
}

/** Where each Window outside the view shows: on the room's edge facing it, spread so none covers another. */
export function bearingsOf(windows: readonly MappedWindow[], viewport: Viewport, margins: PaintMargins, size: Readonly<{ card: number, arrow: number, inset: number, gap: number }>): Bearing[] {

    const { width, height } = viewport.size

    const { offset } = viewport

    // The room a mark's middle may take: inside the Taskbar's room, far enough in for the card and its arrow.
    const reach = size.inset + size.card / 2 + size.gap + size.arrow

    const room = { left: margins.left + reach, right: width - margins.right - reach, top: margins.top + reach, bottom: height - margins.bottom - reach }

    if (room.left >= room.right || room.top >= room.bottom) return []

    const middle = { x: width / 2, y: height / 2 }

    const bearings: Bearing[] = []

    for (const window of windows) {

        if (window.minimized) continue

        const { x, y, width: windowWidth, height: windowHeight } = window.region

        // Any part of it in view, and it is reached.
        const seen = x < offset.x + width / 2 && x + windowWidth > offset.x - width / 2 && y < offset.y + height / 2 && y + windowHeight > offset.y - height / 2

        if (seen) continue

        // From the middle of the screen to the Window's middle, until the room's edge.
        const dx = x + windowWidth / 2 - offset.x, dy = y + windowHeight / 2 - offset.y

        const across = dx > 0 ? (room.right - middle.x) / dx : dx < 0 ? (room.left - middle.x) / dx : Infinity

        const down = dy > 0 ? (room.bottom - middle.y) / dy : dy < 0 ? (room.top - middle.y) / dy : Infinity

        const reached = Math.min(across, down)

        bearings.push({
            identity: window.identity, icon: window.icon, focused: window.focused,
            x: middle.x + dx * reached, y: middle.y + dy * reached,
            angle: Math.atan2(dy, dx) * 180 / Math.PI,
            edge: across <= down ? (dx > 0 ? "right" : "left") : (dy > 0 ? "bottom" : "top")
        })
    }

    // Along each edge, marks closer than a card apart move apart, kept inside the edge's room.
    const step = size.card + size.gap

    for (const edge of ["left", "right", "top", "bottom"] as const) {

        const along = edge === "left" || edge === "right" ? "y" : "x"

        const [first, last] = along === "y" ? [room.top, room.bottom] : [room.left, room.right]

        const row = bearings.filter(bearing => bearing.edge === edge).sort((one, other) => one[along] - other[along])

        for (let index = 1; index < row.length; index++) row[index][along] = Math.max(row[index][along], row[index - 1][along] + step)

        for (let index = row.length - 1; index >= 0; index--) row[index][along] = Math.max(first, Math.min(row[index][along], index === row.length - 1 ? last : row[index + 1][along] - step))
    }

    return bearings
}

interface WindowBearingsProps {
    /** Whether the Map is carried now. */
    shown: boolean
    windows: readonly MappedWindow[]
    viewport: Viewport
    /** The room the Taskbar leaves, which the marks stay inside. */
    margins: PaintMargins
    reducedMotion: boolean
    zIndex: CSSProperties["zIndex"]
}
