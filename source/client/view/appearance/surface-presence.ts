import { type AppearanceTransaction } from "@phreshos/core"
import { type DOMKeyframesDefinition, type Transition } from "motion/react"
import { motionTransition } from "./motion"

export const surfacePresencePose = Object.freeze({
    entered: { scale: 1, y: 0, opacity: 1 },
    entering: { scale: 0.96, y: 8, opacity: 0 }
}) satisfies Record<string, DOMKeyframesDefinition>

/** One shared presence transition owned by Appearance. */
export function surfacePresenceTransition(reducedMotion: boolean, transaction: AppearanceTransaction): Transition {

    return motionTransition(transaction, reducedMotion)
}
