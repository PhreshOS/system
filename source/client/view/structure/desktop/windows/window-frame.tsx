import { useReducedMotion } from "@libs/react-motion"
import { Surface, type Color, type MaterialOptions } from "@phreshos/react-ui"
import { useLayoutEffect, useRef, useState } from "react"
import { motion } from "motion/react"
import { type PresentationAnimation } from "@client/view/components/desktop-host/window-presentation"
import { type AppearanceColor, type WindowFrame as WindowFrameDefinition } from "@phreshos/core"
import { surfaceLifecyclePose, surfacePresenceTransition } from "@client/view/appearance/surface-presence"
import { resolveWindowTransaction } from "@client/view/appearance/motion"
import { useAppearance } from "@phreshos/react-ui"

/** Paints the optional Desktop-owned frame around an under or over presentation. */
export default function WindowFrame({ frame, animation, onComplete }: WindowFrameProps) {

    const reducedMotion = useReducedMotion()
    const appearanceTransaction = useAppearance().transaction
    const revision = animation?.revision
    const transaction = animation ? resolveWindowTransaction(animation.transaction, appearanceTransaction) : null
    const visible = frame !== false
    const animated = revision !== undefined && transaction !== null
    const [hidden, setHidden] = useState(!visible)
    const completed = useRef<number | null>(null)
    const retained = useRef<Exclude<WindowFrameDefinition, false>>(true)

    if (frame !== false) retained.current = frame

    useLayoutEffect(function () {

        if (visible) setHidden(false)

        else if (!animated || reducedMotion) setHidden(true)

    }, [visible, animated, reducedMotion])

    function finish() {

        if (revision === undefined || completed.current === revision) return

        completed.current = revision

        if (!visible) setHidden(true)

        onComplete(revision)
    }

    if (frame === false && !animation) return null

    return <motion.div
        initial={animated && visible && !reducedMotion ? surfaceLifecyclePose.hidden : surfaceLifecyclePose.visible}
        animate={visible ? surfaceLifecyclePose.visible : surfaceLifecyclePose.hidden}
        transition={animated
            ? surfacePresenceTransition(reducedMotion, transaction)
            : { duration: 0 }}
        onAnimationComplete={finish}
        className="pointer-events-none absolute inset-0"
        style={{ visibility: !visible && hidden ? "hidden" : "visible" }}
    >
        <Surface
            aria-hidden="true"
            color={frameColor(retained.current)}
            material={frameMaterial(retained.current)}
            radius={typeof retained.current === "object" ? retained.current.radius : undefined}
            style={{ position: "absolute", inset: 0 }}
        />
    </motion.div>
}

interface WindowFrameProps {

    frame: WindowFrameDefinition

    animation: PresentationAnimation | null

    onComplete: (revision: number) => void
}

function frameColor(frame: Exclude<WindowFrameDefinition, false>): Color | undefined {

    if (frame === true || frame.color === undefined) return undefined

    return appearanceColors.includes(frame.color as AppearanceColor)
        ? `${frame.color as AppearanceColor}:base`
        : frame.color
}

function frameMaterial(frame: Exclude<WindowFrameDefinition, false>): "none" | "full" | MaterialOptions {

    if (frame === true || frame.material === undefined || frame.material === true) return "full"

    if (frame.material === false) return "none"

    return frame.material
}

const appearanceColors = ["background", "foreground", "default", "primary", "secondary", "success", "warning", "danger", "info"] as const satisfies readonly AppearanceColor[]
