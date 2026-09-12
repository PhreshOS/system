import { type CSSProperties } from "react"
import { motion } from "motion/react"
import { windowPaintInsets, type WindowSurfaceSize } from "@client/view/components/window-manager/window-geometry"
import { windowPaintInset } from "../geometry"
import { type Position, type Size } from "@phreshos/core"
import { Surface, useAppearance } from "@phreshos/react-ui"
import { motionTransition } from "@client/view/appearance/motion"
import useWindowGeometryMotion from "./window-geometry-motion"

/** Preview of the placement currently offered by a drag. */
export default function SnapPreview({ shown, visible, bare, paintSurfaceSize, reducedMotion, zIndex }: SnapPreviewProps) {

    const transaction = useAppearance().transaction

    const geometry = useWindowGeometryMotion({
        position: shown.position,
        size: shown.size,
        animation: null,
        immediate: reducedMotion
    })

    return <motion.div
        ref={geometry.frame}
        className="pointer-events-none absolute"
        initial={false}
        animate={{ scale: visible ? 1 : 0.98, opacity: visible ? 1 : 0 }}
        transition={motionTransition(transaction, reducedMotion)}
        style={{ left: 0, top: 0, transformOrigin: "center", zIndex, ...geometry.style }}
    >
        <Surface
            data-snap-preview-frame
            material={{ opacity: "small" }}
            style={{
                position: "absolute",
                ...(bare ? { inset: 0 } : windowPaintInsets(shown.position, shown.size, paintSurfaceSize, windowPaintInset))
            }}
        />
    </motion.div>
}

export interface SnapTarget {
    position: Position
    size: Size
}

interface SnapPreviewProps {
    shown: SnapTarget
    visible: boolean
    bare: boolean
    paintSurfaceSize: WindowSurfaceSize
    reducedMotion: boolean
    zIndex: CSSProperties["zIndex"]
}
