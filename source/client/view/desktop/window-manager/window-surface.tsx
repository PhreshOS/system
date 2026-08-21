import { useReducedMotion } from "@libs/react-motion"
import { isScaleLevel, scale, type Easing, type SurfaceSettings } from "@phreshos/core"
import { Surface, useTheme } from "@phreshos/react-ui"
import { useLayoutEffect, useRef, useState } from "react"
import { type LocalSurfaceState } from "../client-host/local-window"

const systemDuration = 240

const systemEasing = "ease-out"

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

        setRendered(settings)

        surface.style.opacity = String(target.opacity)

        surface.style.borderRadius = target.borderRadius

        const transaction = requestedAnimation?.transaction

        const duration = transaction?.duration ?? systemDuration

        if (!transaction || !changed) return

        if (reducedMotion || duration === 0) {

            onComplete(revision!)

            return
        }

        const animation = surface.animate([from, target], {

            duration,

            easing: easing(transaction.easing),

            fill: "both"
        })

        animation.finished.then(function () {

            animation.cancel()

            onComplete(revision!)

        }, () => undefined)

        return function () {

            const shown = getComputedStyle(surface)

            surface.style.opacity = shown.opacity

            surface.style.borderRadius = shown.borderRadius

            animation.cancel()
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

function easing(value: Easing | undefined) {

    if (typeof value === "string") return value

    return value ? `cubic-bezier(${value.join(", ")})` : systemEasing
}

interface WindowSurfaceProps {

    state: LocalSurfaceState

    onComplete: (revision: number) => void
}
