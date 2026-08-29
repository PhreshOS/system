import { animate, type AnimationPlaybackControlsWithThen } from "motion"
import { motionDuration, motionDurations, motionEase } from "./motion"

const entered = { scale: 1, y: 0 }

const entering = { scale: 0.96, y: 8 }

const animations = new WeakMap<HTMLElement, AnimationPlaybackControlsWithThen>()

/** Establish the first frame before a surface becomes visible. */
export function prepareSurfaceEntrance(surface: HTMLElement | null, reducedMotion: boolean) {

    if (!surface) return

    stop(surface)
    set(surface, reducedMotion ? entered : entering)
}

/** Give every system surface the same entrance motion. */
export function enterSurface(surface: HTMLElement | null, reducedMotion: boolean) {

    if (!surface) return null

    stop(surface)

    if (reducedMotion) {

        set(surface, entered)

        return null
    }

    const animation = animate(surface, entered, {
        duration: motionDuration(motionDurations.presence),
        ease: motionEase([0.33, 1, 0.68, 1])
    })

    animations.set(surface, animation)

    return animation
}

/** Stop presence motion and leave the surface ready for its next entrance. */
export function restSurface(surface: HTMLElement | null) {

    if (!surface) return

    stop(surface)
    set(surface, entered)
}

function stop(surface: HTMLElement) {
    animations.get(surface)?.stop()
    animations.delete(surface)
}

function set(surface: HTMLElement, target: typeof entered) {
    surface.style.transform = target.scale === 1 && target.y === 0 ? "" : `translateY(${target.y}px) scale(${target.scale})`
}
