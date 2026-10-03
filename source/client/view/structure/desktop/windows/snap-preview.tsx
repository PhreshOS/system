import { type CSSProperties } from "react"
import { motion } from "motion/react"
import { windowPaintInsets, type PaintMargins, type ViewSize } from "@client/view/components/window-manager/window-geometry"
import { type Position, type Size } from "@phreshos/core"
import { Surface, useTiming } from "@phreshos/react-ui"
import { motionTransition } from "@client/view/appearance/motion"
import useWindowGeometryMotion from "./window-geometry-motion"

/** Preview of the placement currently offered by a drag. */
export default function SnapPreview({ shown, visible, blocked = false, minimumSize, paintSurfaceSize, paintInset, paintMargins, reducedMotion, zIndex }: SnapPreviewProps) {

    const transaction = useTiming()("change")

    const geometry = useWindowGeometryMotion({
        position: shown.position,
        size: shown.size,
        animation: null,
        transaction,
        immediate: reducedMotion,
        minimumSize
    })

    return <motion.div
        ref={geometry.frame}
        className="pointer-events-none absolute"
        style={{ left: 0, top: 0, zIndex, ...geometry.style }}
    >
        <motion.div
            initial={false}
            animate={{ scale: visible ? 1 : 0.98, opacity: visible ? 1 : 0 }}
            transition={motionTransition(transaction, reducedMotion)}
            style={{ position: "absolute", inset: 0, transformOrigin: "center" }}
        >
            <Surface
                data-snap-preview-frame
                // Held where the plane goes no further, the same surface in a soft danger.
                color={blocked ? "danger:soft" : undefined}
                material={{ opacity: "small" }}
                style={{ position: "absolute", ...windowPaintInsets(shown.position, shown.size, paintSurfaceSize, paintInset, paintMargins) }}
            />
        </motion.div>
    </motion.div>
}

export interface SnapTarget {
    position: Position
    size: Size
}

interface SnapPreviewProps {
    shown: SnapTarget
    visible: boolean
    /** The hand holds the Window against the plane's end. */
    blocked?: boolean
    minimumSize?: ViewSize
    paintSurfaceSize: ViewSize
    paintInset: number
    paintMargins: PaintMargins
    reducedMotion: boolean
    zIndex: CSSProperties["zIndex"]
}
