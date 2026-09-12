import { useReducedMotion } from "@libs/react-motion"
import { Surface } from "@phreshos/react-ui"
import { useLayoutEffect, useRef, useState } from "react"
import { motion } from "motion/react"
import { type LocalSurfaceState } from "@client/view/components/desktop-host/local-window"
import { surfacePresencePose, surfacePresenceTransition } from "@client/view/appearance/surface-presence"

/** Projects one representation-local Surface without animating its material host. */
export default function WindowSurface({ state, onComplete }: WindowSurfaceProps) {

    const { transition, visible } = state
    const reducedMotion = useReducedMotion()
    const revision = transition?.revision
    const transaction = transition?.transaction
    const animated = revision !== undefined && transaction !== undefined
    const [hidden, setHidden] = useState(!visible)
    const completed = useRef<number | null>(null)

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

    return <motion.div
        initial={animated && visible && !reducedMotion ? surfacePresencePose.entering : surfacePresencePose.entered}
        animate={visible ? surfacePresencePose.entered : surfacePresencePose.entering}
        transition={animated
            ? surfacePresenceTransition(reducedMotion, transaction)
            : { duration: 0 }}
        onAnimationComplete={finish}
        className="pointer-events-none absolute inset-0"
        style={{ visibility: !visible && hidden ? "hidden" : "visible" }}
    >
        <Surface aria-hidden="true" style={{ position: "absolute", inset: 0 }} />
    </motion.div>
}

interface WindowSurfaceProps {

    state: LocalSurfaceState

    onComplete: (revision: number) => void
}
