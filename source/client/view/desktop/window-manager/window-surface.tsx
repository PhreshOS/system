import { useReducedMotion } from "@libs/react-motion"
import { Surface } from "@phreshos/react-ui"
import { useLayoutEffect, useRef, useState } from "react"
import { type LocalSurfaceState } from "../../components/desktop-host/local-window"
import gsap, { motionDuration, motionEase } from "../../appearance/motion"

const systemDuration = 240

/** Projects one representation-local target and animates explicit replacements. */
export default function WindowSurface({ state, onComplete }: WindowSurfaceProps) {

    const { transition, visible } = state

    const element = useRef<HTMLDivElement>(null)

    const firstRender = useRef(true)

    const reducedMotion = useReducedMotion()

    // Keep the last painted target in React while an incoming transition is
    // prepared from the element's current compositor value.
    const [renderedVisible, setRenderedVisible] = useState(visible)

    useLayoutEffect(function () {

        const surface = element.current

        if (!surface) return

        const current = getComputedStyle(surface)

        const revision = transition?.revision ?? null

        const changed = revision !== null

        const from = { opacity: firstRender.current && visible ? 0 : Number(current.opacity) }

        firstRender.current = false

        const transaction = transition?.transaction

        const duration = transaction?.duration ?? systemDuration

        gsap.killTweensOf(surface)

        if (!transaction || !changed || reducedMotion || duration === 0) {

            gsap.set(surface, { opacity: visible ? 1 : 0 })
            setRenderedVisible(visible)

            if (transaction && changed) onComplete(revision!)

            return
        }

        const animation = gsap.fromTo(surface, from, {
            opacity: visible ? 1 : 0,
            duration: motionDuration(duration),
            ease: motionEase(transaction.easing),
            overwrite: "auto",
            onComplete: function () {

                setRenderedVisible(visible)
                onComplete(revision!)
            }
        })

        return function () {

            const shown = getComputedStyle(surface)

            surface.style.opacity = shown.opacity

            animation.kill()
        }

    }, [reducedMotion, transition?.revision, visible])

    return <Surface

        ref={element}

        data-window-surface

        aria-hidden="true"

        className="pointer-events-none absolute inset-0"

        style={{ opacity: renderedVisible ? 1 : 0 }}

    />
}

interface WindowSurfaceProps {

    state: LocalSurfaceState

    onComplete: (revision: number) => void
}
