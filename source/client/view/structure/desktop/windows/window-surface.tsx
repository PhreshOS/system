import { useReducedMotion } from "@libs/react-motion"
import { resolveRadius, Surface, type Appearance, type Color, type MaterialOptions } from "@phreshos/react-ui"
import { useLayoutEffect, useRef, useState } from "react"
import { motion } from "motion/react"
import { type PresentationAnimation } from "@client/view/components/desktop-host/window-presentation"
import { type AppearanceColor, type WindowPresentationSurface as WindowSurfaceDefinition } from "@phreshos/core"
import { surfaceLifecyclePose, surfacePresenceTransition } from "@client/view/appearance/surface-presence"
import { resolveWindowTransaction } from "@client/view/appearance/motion"
import { useAppearance } from "@phreshos/react-ui"

/** Paints the optional Desktop-owned backing surface for a supported presentation. */
export default function WindowSurface({ surface, animation, onComplete }: WindowSurfaceProps) {

    const reducedMotion = useReducedMotion()
    const appearance = useAppearance()
    const appearanceTransaction = appearance.transaction
    const revision = animation?.revision
    const transaction = animation ? resolveWindowTransaction(animation.transaction, appearanceTransaction) : null
    const visible = surface !== false
    const animated = revision !== undefined && transaction !== null
    const [hidden, setHidden] = useState(!visible)
    const completed = useRef<number | null>(null)
    const retained = useRef<VisibleWindowSurface>(true)

    if (surface !== false) retained.current = surface

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

    if (surface === false && !animation) return null

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
            color={surfaceColor(retained.current)}
            material={surfaceMaterial(retained.current)}
            radius={windowSurfaceRadius(retained.current, appearance)}
            style={{ position: "absolute", inset: 0 }}
        />
    </motion.div>
}

interface WindowSurfaceProps {

    surface: WindowSurfaceDefinition

    animation: PresentationAnimation | null

    onComplete: (revision: number) => void
}

type VisibleWindowSurface = Exclude<WindowSurfaceDefinition, false>

function surfaceColor(surface: VisibleWindowSurface): Color | undefined {

    if (surface === true || surface.color === undefined) return undefined

    return appearanceColors.includes(surface.color as AppearanceColor)
        ? `${surface.color as AppearanceColor}:base`
        : surface.color
}

function surfaceMaterial(surface: VisibleWindowSurface): "none" | "full" | MaterialOptions {

    if (surface === true || surface.material === undefined) return "full"

    if (surface.material === false) return "none"

    return surface.material
}

const appearanceColors = ["background", "foreground", "default", "primary", "secondary", "success", "warning", "danger", "info"] as const satisfies readonly AppearanceColor[]

/** Resolves the one boundary shared by Desktop paint and standard-window content. */
export function windowSurfaceRadius(surface: VisibleWindowSurface, appearance: Appearance) {

    const radius = typeof surface === "object" ? surface.radius : undefined

    return resolveRadius(radius ?? "medium", appearance)
}
