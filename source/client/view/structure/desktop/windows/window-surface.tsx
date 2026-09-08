import { useReducedMotion } from "@libs/react-motion"
import { Surface } from "@phreshos/react-ui"
import { useLayoutEffect, useRef } from "react"
import { type LocalSurfaceState } from "@client/view/components/desktop-host/local-window"
import gsap, { motionDuration, motionDurations, motionEase } from "@client/view/appearance/motion"

/** Projects one representation-local target and animates explicit replacements. */
export default function WindowSurface({ state, onComplete }: WindowSurfaceProps) {

    const { transition, visible } = state

    const element = useRef<HTMLDivElement>(null)

    const firstRender = useRef(true)

    const reducedMotion = useReducedMotion()

    useLayoutEffect(function () {

        const surface = element.current

        if (!surface) return

        const revision = transition?.revision ?? null

        const changed = revision !== null

        const initial = firstRender.current

        firstRender.current = false

        const transaction = transition?.transaction

        const duration = transaction?.duration ?? motionDurations.presence

        // Desktop owns visibility of the whole Surface; React UI owns its
        // material. Never capture or overwrite opacity on internal paint layers.
        gsap.killTweensOf(surface)

        if (!transaction || !changed || reducedMotion || duration === 0) {

            gsap.set(surface, { opacity: visible ? 1 : 0 })

            if (transaction && changed) onComplete(revision!)

            return
        }

        const animation = gsap.fromTo(surface, {
            opacity: initial && visible ? 0 : Number(getComputedStyle(surface).opacity)
        }, {
            opacity: visible ? 1 : 0,
            duration: motionDuration(duration),
            ease: motionEase(transaction.easing),
            overwrite: "auto",
            onComplete: () => onComplete(revision!)
        })

        return function () {

            animation.kill()
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
