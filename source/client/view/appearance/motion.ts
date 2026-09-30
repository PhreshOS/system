import { progressAt, type Transaction, type Easing, type PresentationTransaction } from "@phreshos/core"
import { type Transition } from "motion/react"

const easings: Record<Extract<Easing, string>, Transition["ease"]> = {
    linear: "linear",
    ease: [0.25, 0.1, 0.25, 1],
    "ease-in": "easeIn",
    "ease-out": "easeOut",
    "ease-in-out": "easeInOut"
}

/** Translates one transaction into Motion's units. */
export function motionTransition(transaction: Transaction, reduced = false): Transition {

    return {
        type: "tween",
        duration: reduced ? 0 : transaction.duration / 1_000,
        // A spring plays through the same function every follower uses, so all of them draw one motion.
        ease: isCurve(transaction.easing)
            ? motionEase(transaction.easing)
            : (t: number) => progressAt(transaction, t * transaction.duration)
    }
}

/**
 * The motion a presentation write moves on: the one derived for the change, that one made a
 * number of times as long, or the exact one the Program chose. Stretching a derived motion keeps its
 * shape: even a spring's stiffness follows its duration.
 */
export function resolvePresentationTransaction(transaction: PresentationTransaction | null | undefined, derived: Transaction): Transaction {

    if (transaction === undefined || transaction === null) return derived

    if (typeof transaction === "number") return Object.freeze({ duration: Math.round(derived.duration * transaction), easing: derived.easing })

    return transaction
}

type Curve = Extract<Easing, string> | readonly [number, number, number, number]

/** Whether an easing is a curve, not a spring. */
function isCurve(easing: Easing): easing is Curve {

    return typeof easing === "string" || Array.isArray(easing)
}

function motionEase(easing: Curve): Transition["ease"] {

    return typeof easing === "string" ? easings[easing] : [...easing]
}
