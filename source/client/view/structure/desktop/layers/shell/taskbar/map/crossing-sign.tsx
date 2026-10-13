import { type CSSProperties } from "react"
import { motion } from "motion/react"
import { Surface, useTiming } from "@phreshos/react-ui"
import { ArrowDown, ArrowDownLeft, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUp, ArrowUpLeft, ArrowUpRight } from "@phreshos/react-ui/icons"
import { motionTransition } from "@client/view/appearance/motion"
import { type PaintMargins } from "@client/view/components/window-manager/window-geometry"
import { type Direction } from "../../../../edge-hold"

/** The arrow for each way, by row (up, level, down) and column (left, level, right). */
const arrows = [
    [ArrowUpLeft, ArrowUp, ArrowUpRight],
    [ArrowLeft, null, ArrowRight],
    [ArrowDownLeft, ArrowDown, ArrowDownRight]
]

/** Where each way places the sign along an axis. */
const sides = ["flex-start", "center", "flex-end"] as const

/**
 * Where the Map is held against an edge of the screen: a sign at that edge, pointing where the view
 * goes, with the place of the view shown now. Unlike a Window's, the Map's hold places nothing, so it
 * shows a way, not a placement: the arrow, then the place, side by side. Each time the
 * view crosses, its new place comes in from the way it went and the sign leans that way, so a
 * crossing shows even where no Window moves. Where the plane goes no further, it turns to danger.
 */
export default function CrossingSign({ direction, place, visible, blocked, margins, spacing, reducedMotion, zIndex }: CrossingSignProps) {

    const transaction = useTiming()("change")

    const Arrow = arrows[direction.y + 1][direction.x + 1]

    const lean = { x: direction.x * spacing / 2, y: direction.y * spacing / 2 }

    return <div aria-hidden="true" className="pointer-events-none absolute flex" style={{
        top: margins.top + spacing, right: margins.right + spacing, bottom: margins.bottom + spacing, left: margins.left + spacing,
        justifyContent: sides[direction.x + 1], alignItems: sides[direction.y + 1], zIndex
    }}>
        <motion.div
            initial={false}
            animate={{ opacity: visible ? 1 : 0, x: visible ? 0 : -direction.x * spacing, y: visible ? 0 : -direction.y * spacing }}
            transition={motionTransition(transaction, reducedMotion)}
        >
            {/* Drawn anew at each place, so each crossing leans it once. */}
            <motion.div key={place} initial={reducedMotion ? false : lean} animate={{ x: 0, y: 0 }} transition={motionTransition(transaction, reducedMotion)}>
                <Surface color={blocked ? "danger:soft" : "primary:soft"} radius="full" className="flex items-center justify-center"
                    style={{ gap: spacing / 2, padding: spacing, minWidth: spacing * 8 }}>
                    {Arrow && <Arrow />}
                    <motion.span className="tabular-nums" initial={reducedMotion ? false : { opacity: 0, ...lean }} animate={{ opacity: 1, x: 0, y: 0 }} transition={motionTransition(transaction, reducedMotion)}>
                        {place}
                    </motion.span>
                </Surface>
            </motion.div>
        </motion.div>
    </div>
}

interface CrossingSignProps {
    /** The edges it is held against; kept while it fades away. */
    direction: Direction
    /** The place of the view shown now, as the Map names it. */
    place: string
    visible: boolean
    /** The hand holds it against the plane's end. */
    blocked: boolean
    /** The room the Taskbar leaves, which the sign stays inside. */
    margins: PaintMargins
    spacing: number
    reducedMotion: boolean
    zIndex: CSSProperties["zIndex"]
}
