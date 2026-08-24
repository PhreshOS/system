import { type Easing } from "@phreshos/core"
import gsap from "gsap"
import { CustomEase } from "gsap/CustomEase"

gsap.registerPlugin(CustomEase)

const curves: Record<Exclude<Easing, readonly number[]>, readonly [number, number, number, number]> = {
    linear: [0, 0, 1, 1],
    ease: [0.25, 0.1, 0.25, 1],
    "ease-in": [0.42, 0, 1, 1],
    "ease-out": [0, 0, 0.58, 1],
    "ease-in-out": [0.42, 0, 0.58, 1]
}

const registered = new Map<string, gsap.EaseFunction>()

/** Preserves public CSS timing curves while GSAP owns their interpolation. */
export function motionEase(value: Easing | undefined, fallback: Easing = "ease-out") {

    const selected = value ?? fallback
    const points = typeof selected === "string" ? curves[selected] : selected
    const key = points.join(",")
    const existing = registered.get(key)

    if (existing) return existing

    const easing = CustomEase.create(`phresh-${registered.size}`, key)

    registered.set(key, easing)

    return easing
}

export function motionDuration(milliseconds: number) {

    return milliseconds / 1_000
}

export default gsap
