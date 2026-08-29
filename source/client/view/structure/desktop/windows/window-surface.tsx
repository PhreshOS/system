import { useReducedMotion } from "@libs/react-motion"
import { Surface } from "@phreshos/react-ui"
import { useLayoutEffect, useRef } from "react"
import { animate } from "motion"
import { type LocalSurfaceState } from "../../../components/desktop-host/local-window"
import { motionDuration, motionDurations, motionEase } from "../../../appearance/motion"

const paintSelector = "[data-surface-backdrop], [data-surface-border], [data-surface-material]"

/** Projects one representation-local target and animates explicit replacements. */
export default function WindowSurface({ state, onComplete }: WindowSurfaceProps) {

    const { transition, visible } = state

    const element = useRef<HTMLDivElement>(null)

    const firstRender = useRef(true)

    const reducedMotion = useReducedMotion()

    // The configured material and border opacity remain the visible targets;
    // visibility animation must not replace those values with a root opacity.
    const visibleOpacity = useRef(new Map<Element, number>())

    useLayoutEffect(function () {

        const surface = element.current

        if (!surface) return

        const layers = [...surface.querySelectorAll<HTMLElement>(paintSelector)]

        for (const layer of layers) {

            if (!visibleOpacity.current.has(layer)) visibleOpacity.current.set(layer, Number(getComputedStyle(layer).opacity))
        }

        const revision = transition?.revision ?? null

        const initial = firstRender.current

        firstRender.current = false

        const transaction = transition?.transaction

        const duration = transaction?.duration ?? motionDurations.presence

        if (!transaction || revision === null || reducedMotion || duration === 0) {

            for (const layer of layers) layer.style.opacity = String(visible ? visibleOpacity.current.get(layer) : 0)

            if (transaction && revision !== null) onComplete(revision)

            return
        }

        const animations = layers.map(layer => animate(layer, {
            opacity: [
                initial && visible ? 0 : Number(getComputedStyle(layer).opacity),
                visible ? visibleOpacity.current.get(layer) ?? 1 : 0
            ]
        }, {
            duration: motionDuration(duration),
            ease: motionEase(transaction.easing)
        }))

        let active = true

        void Promise.all(animations).then(() => {
            if (active) onComplete(revision)
        })

        return function () {
            active = false
            for (const animation of animations) animation.stop()
        }

    }, [reducedMotion, transition?.revision, visible])

    return <Surface

        ref={element}

        data-window-surface

        aria-hidden="true"

        className="pointer-events-none absolute inset-0"

    />
}

interface WindowSurfaceProps {

    state: LocalSurfaceState

    onComplete: (revision: number) => void
}
