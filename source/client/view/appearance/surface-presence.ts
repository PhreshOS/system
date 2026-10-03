import { type Transaction } from "@phreshos/core"
import { type DOMKeyframesDefinition, type Transition } from "motion/react"
import { motionTransition } from "./motion"

/** Shared appearance and disappearance of one complete interactive surface. */
export const surfaceLifecyclePose = Object.freeze({
    visible: { scale: 1, y: 0, opacity: 1 },
    hidden: { scale: 1.05, y: 0, opacity: 0 }
}) satisfies Record<string, DOMKeyframesDefinition>

/** One shared presence transition owned by Appearance. */
export function surfacePresenceTransition(reducedMotion: boolean, transaction: Transaction): Transition {

    return motionTransition(transaction, reducedMotion)
}
