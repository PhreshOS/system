import { useReducedMotion } from "@libs/react-motion"
import { isScaleLevel, scale, type WindowSurfaceEasing, type WindowSurfaceSettings } from "@phreshos/core"
import { GlassSurface, useTheme } from "@phreshos/react-ui"
import { useLayoutEffect, useRef, useState } from "react"

const systemDuration = 240

const systemEasing = "ease-out"

/** Projects one authoritative target and animates only live replacements. */
export default function WindowSurface({ revision, settings }: WindowSurfaceProps) {

    const element = useRef<HTMLDivElement>(null)

    const previousRevision = useRef<number | null>(null)

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

        const changed = previousRevision.current === null

            ? revision > 0

            : revision !== previousRevision.current

        const from = previousRevision.current === null && changed

            ? { opacity: 0, borderRadius: "0px" }

            : { opacity: Number(current.opacity), borderRadius: current.borderRadius }

        previousRevision.current = revision

        setRendered(settings)

        surface.style.opacity = String(target.opacity)

        surface.style.borderRadius = target.borderRadius

        const transaction = settings.transaction

        const duration = transaction?.duration ?? systemDuration

        if (!transaction || reducedMotion || duration === 0 || !changed) return

        const animation = surface.animate([from, target], {

            duration,

            easing: easing(transaction.easing),

            fill: "both"
        })

        animation.finished.then(function () {

            animation.cancel()

        }, () => undefined)

        return function () {

            const shown = getComputedStyle(surface)

            surface.style.opacity = shown.opacity

            surface.style.borderRadius = shown.borderRadius

            animation.cancel()
        }

    }, [reducedMotion, revision, settings, themeRadius])

    const target = values(rendered, themeRadius)

    return <GlassSurface

        ref={element}

        data-window-surface

        aria-hidden="true"

        className="pointer-events-none absolute inset-0"

        style={{ opacity: target.opacity, borderRadius: target.borderRadius }}

    />
}

function values(settings: WindowSurfaceSettings, themeRadius: number) {

    const radius = settings.radius

    return {

        opacity: settings.opacity ?? 1,

        borderRadius: radius === "full" ? "50%" : `${isScaleLevel(radius) ? scale(themeRadius, radius) : radius ?? 0}px`
    }
}

function easing(value: WindowSurfaceEasing | undefined) {

    if (typeof value === "string") return value

    return value ? `cubic-bezier(${value.join(", ")})` : systemEasing
}

interface WindowSurfaceProps {

    settings: WindowSurfaceSettings

    /** Zero is an initial snapshot; positive revisions are live changes. */
    revision: number
}
