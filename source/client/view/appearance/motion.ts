import { progressAt, type AppearanceTransaction, type Easing, type PresentationTransaction } from "@phreshos/core"
import { type Transition } from "motion/react"

const easings: Record<Extract<Easing, string>, Transition["ease"]> = {
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
        // A spring plays through the same function every follower uses, so all of them draw one motion.
        ease: isCurve(transaction.easing)
            ? motionEase(transaction.easing)
            : (t: number) => progressAt(transaction, t * transaction.duration)
    }
}

/** Resolves an optional presentation timing against the current Appearance. */
export function resolveWindowTransaction(transaction: PresentationTransaction | undefined, appearance: AppearanceTransaction): AppearanceTransaction {

    if (transaction === undefined) return appearance

    if (typeof transaction === "number") return { duration: transaction, easing: appearance.easing }

    return transaction
}

/** Translates the public easing vocabulary into a CSS timing function. */
export function cssEasing(easing: Easing) {

    if (typeof easing === "string") return easing

    if (!isCurve(easing)) {

        // A spring in CSS: its path sampled as a linear() curve over a nominal duration.
        const samples = Array.from({ length: 41 }, (_, index) => progressAt({ duration: 1000, easing }, index * 25).toFixed(4))

        return "linear(" + samples.join(", ") + ")"
    }

    return "cubic-bezier(" + (easing as readonly number[]).join(", ") + ")"
}

type Curve = Extract<Easing, string> | readonly [number, number, number, number]

/** Whether an easing is a curve, not a spring. */
function isCurve(easing: Easing): easing is Curve {

    return typeof easing === "string" || Array.isArray(easing)
}

function motionEase(easing: Curve): Transition["ease"] {

    return typeof easing === "string" ? easings[easing] : [...easing]
}
