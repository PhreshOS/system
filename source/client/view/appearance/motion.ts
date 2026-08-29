import { type Easing as SystemEasing } from "@phreshos/core"
import { type Easing } from "motion"

const curves: Record<Exclude<SystemEasing, readonly number[]>, Easing> = {
    linear: "linear",
    ease: [0.25, 0.1, 0.25, 1],
    "ease-in": "easeIn",
    "ease-out": "easeOut",
    "ease-in-out": "easeInOut"
}

/** Shared interaction timings in the same millisecond unit as public transactions. */
export const motionDurations = Object.freeze({
    control: 100,
    minimize: 110,
    close: 160,
    snap: 180,
    feedback: 200,
    morph: 220,
    presence: 240,
    restore: 240,
    geometry: 300
})

/** Converts a public CSS timing curve into Motion's equivalent easing. */
export function motionEase(value: SystemEasing | undefined, fallback: SystemEasing = "ease-out"): Easing {

    const selected = value ?? fallback

    return typeof selected === "string" ? curves[selected] : selected
}

export function motionDuration(milliseconds: number) {

    return milliseconds / 1_000
}
