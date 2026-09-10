import { type Easing } from "@phreshos/core"
import gsap, { motionDuration, motionDurations, motionEase } from "./motion"

const entered = { scale: 1, y: 0 }

const entering = { scale: 0.96, y: 8 }

interface SurfacePresenceTransition {

    duration?: number

    easing?: Easing

    onComplete?: () => void
}

/** Establish the first frame before a surface becomes visible. */
export function prepareSurfaceEntrance(surface: HTMLElement | null, reducedMotion: boolean) {

    if (!surface) return

    gsap.killTweensOf(surface)

    gsap.set(surface, reducedMotion ? entered : entering)
}

/** Give every system surface the same entrance motion. */
export function enterSurface(surface: HTMLElement | null, reducedMotion: boolean, transition: SurfacePresenceTransition = {}) {

    if (!surface) return null

    gsap.killTweensOf(surface)

    const duration = transition.duration ?? motionDurations.presence

    if (reducedMotion || duration === 0) {

        gsap.set(surface, entered)

        transition.onComplete?.()

        return null
    }

    return gsap.to(surface, {
        ...entered,
        duration: motionDuration(duration),
        ease: transition.easing === undefined ? "power3.out" : motionEase(transition.easing),
        overwrite: "auto",
        onComplete: transition.onComplete
    })
}

/** Reverse the shared entrance pose when a Surface leaves. */
export function leaveSurface(surface: HTMLElement | null, reducedMotion: boolean, transition: SurfacePresenceTransition = {}) {

    if (!surface) return null

    gsap.killTweensOf(surface)

    const duration = transition.duration ?? motionDurations.presence

    if (reducedMotion || duration === 0) {

        gsap.set(surface, entered)

        transition.onComplete?.()

        return null
    }

    return gsap.to(surface, {
        ...entering,
        duration: motionDuration(duration),
        ease: transition.easing === undefined ? "power3.in" : motionEase(transition.easing),
        overwrite: "auto",
        onComplete: transition.onComplete
    })
}

/** Stop presence motion and leave the surface ready for its next entrance. */
export function restSurface(surface: HTMLElement | null) {

    if (!surface) return

    gsap.killTweensOf(surface)

    gsap.set(surface, entered)
}
