import { useReducedMotion } from "@libs/react-motion"
import { Surface } from "@phreshos/react-ui"
import { useLayoutEffect, useRef } from "react"
import { type LocalSurfaceState } from "@client/view/components/desktop-host/local-window"
import gsap from "@client/view/appearance/motion"
import { enterSurface, leaveSurface, prepareSurfaceEntrance, restSurface } from "@client/view/appearance/surface-presence"

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

        // Desktop owns presence of the whole Surface; React UI owns its
        // material. The Program's transaction controls the shared entrance
        // pose without reaching into paint, border or backdrop layers.
        if (!transaction || !changed) {

            restSurface(surface)

            gsap.set(surface, { visibility: visible ? "visible" : "hidden" })

            return
        }

        const hidden = getComputedStyle(surface).visibility === "hidden"

        if (visible && (initial || hidden)) prepareSurfaceEntrance(surface, reducedMotion)

        gsap.set(surface, { visibility: "visible" })

        const complete = function () {

            if (!visible) gsap.set(surface, { visibility: "hidden" })

            onComplete(revision!)
        }

        const animation = visible

            ? enterSurface(surface, reducedMotion, { ...transaction, onComplete: complete })

            : leaveSurface(surface, reducedMotion, { ...transaction, onComplete: complete })

        return function () {

            animation?.kill()
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
