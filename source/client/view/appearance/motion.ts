import { type AppearanceTransaction, type Easing } from "@phreshos/core"
import { type Transition } from "motion/react"

const easings: Record<Exclude<Easing, readonly number[]>, Transition["ease"]> = {
    linear: "linear",
    ease: [0.25, 0.1, 0.25, 1],
    "ease-in": "easeIn",
    "ease-out": "easeOut",
    "ease-in-out": "easeInOut"
}

/** Translates the public Appearance timing contract into Motion's units. */
export function motionTransition(transaction: AppearanceTransaction, reduced = false): Transition {

    return {
        type: "tween",
        duration: reduced ? 0 : transaction.duration / 1_000,
        ease: motionEase(transaction.easing)
    }
}

/** Translates the public easing vocabulary into a CSS timing function. */
export function cssEasing(easing: Easing) {

    return typeof easing === "string" ? easing : "cubic-bezier(" + easing.join(", ") + ")"
}

function motionEase(easing: Easing): Transition["ease"] {

    return typeof easing === "string" ? easings[easing] : [...easing]
}
