import { useReducedMotion } from "@libs/react-motion"
import { isScaleLevel, scale, type SurfaceSettings } from "@phreshos/core"
import { Surface, useTheme } from "@phreshos/react-ui"
import { useLayoutEffect, useRef, useState } from "react"
import { type LocalSurfaceState } from "../client-host/local-window"
import gsap, { motionDuration, motionEase } from "../../appearance/motion"

const systemDuration = 240

/** Projects one representation-local target and animates explicit replacements. */
export default function WindowSurface({ state, onComplete }: WindowSurfaceProps) {

    const { settings, animation: requestedAnimation } = state

    const element = useRef<HTMLDivElement>(null)

    const firstRender = useRef(true)

    const reducedMotion = useReducedMotion()

    const themeRadius = useTheme().radius

    // Rendering retains the last settled target while an incoming target is
    // prepared imperatively. This leaves the element's current visual values
    // available when a new transaction interrupts one already in flight.
    const [rendered, setRendered] = useState(settings)

    useLayoutEffect(function () {

        const surface = element.current

        if (!surface) return

        const target = values(settings, themeRadius)

        const current = getComputedStyle(surface)

        const revision = requestedAnimation?.revision ?? null

        const changed = revision !== null

        const from = firstRender.current && changed

            ? { opacity: 0, borderRadius: "0px" }

            : { opacity: Number(current.opacity), borderRadius: current.borderRadius }

        firstRender.current = false

        const transaction = requestedAnimation?.transaction

        const duration = transaction?.duration ?? systemDuration

        gsap.killTweensOf(surface)

        if (!transaction || !changed || reducedMotion || duration === 0) {

            gsap.set(surface, target)
            setRendered(settings)

            if (transaction && changed) onComplete(revision!)

            return
        }

        const animation = gsap.fromTo(surface, from, {
            ...target,
            duration: motionDuration(duration),
            ease: motionEase(transaction.easing),
            overwrite: "auto",
            onComplete: function () {

                setRendered(settings)
                onComplete(revision!)
            }
        })

        return function () {

            const shown = getComputedStyle(surface)

            surface.style.opacity = shown.opacity

            surface.style.borderRadius = shown.borderRadius

            animation.kill()
        }

    }, [reducedMotion, requestedAnimation?.revision, settings, themeRadius])

    const target = values(rendered, themeRadius)

    return <Surface

        ref={element}

        data-window-surface

        aria-hidden="true"

        className="pointer-events-none absolute inset-0"

        style={{ opacity: target.opacity, borderRadius: target.borderRadius }}

    />
}

function values(settings: SurfaceSettings, themeRadius: number) {

    const radius = settings.radius

    return {

        opacity: settings.opacity ?? 1,

        borderRadius: radius === "full" ? "50%" : `${isScaleLevel(radius) ? scale(themeRadius, radius) : radius ?? 0}px`
    }
}

interface WindowSurfaceProps {

    state: LocalSurfaceState

    onComplete: (revision: number) => void
}
