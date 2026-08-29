import { useReducedMotionConfig } from "motion/react"

/** Returns the effective Motion policy selected at the desktop root. */
export function useReducedMotion() {
    return useReducedMotionConfig() ?? false
}
