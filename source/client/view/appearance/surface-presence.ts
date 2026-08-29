import { animate, motionValue, styleEffect, type AnimationPlaybackControlsWithThen, type MotionValue, type ValueAnimationTransition } from "motion"
import { motionDuration, motionDurations, motionEase } from "./motion"

const entered = "translateY(0px) scale(1)"

const entering = "translateY(8px) scale(0.96)"

const resting = "none"

const motions = new WeakMap<HTMLElement, SurfaceMotion>()

/** Establish the first frame before a surface becomes visible. */
export function prepareSurfaceEntrance(surface: HTMLElement | null, reducedMotion: boolean) {

    if (!surface) return

    stop(surface)
    set(surface, reducedMotion ? resting : entering)
}

/** Give every system surface the same entrance motion. */
export function enterSurface(surface: HTMLElement | null, reducedMotion: boolean) {

    if (!surface) return null

    stop(surface)

    if (reducedMotion) {

        set(surface, resting)

        return null
    }

    return animateSurfaceTransform(surface, 1, 0, {
        duration: motionDuration(motionDurations.presence),
        ease: motionEase([0.33, 1, 0.68, 1])
    })
}

/** Let a dismissible surface leave before its host removes it from paint. */
export function exitSurface(surface: HTMLElement | null, reducedMotion: boolean) {

    if (!surface) return null

    if (reducedMotion) {

        restSurface(surface)

        return null
    }

    return animateSurfaceTransform(surface, 0.96, 8, {
        duration: motionDuration(motionDurations.dismiss),
        ease: motionEase("ease-in"),
        onComplete: () => restSurface(surface)
    })
}

/** Stop presence motion and leave the surface ready for its next entrance. */
export function restSurface(surface: HTMLElement | null) {

    if (!surface) return

    stop(surface)
    set(surface, resting)
}

/** Set a surface pose through the same transform owner used by its motion. */
export function setSurfaceTransform(surface: HTMLElement | null, scale: number, y: number) {

    if (!surface) return

    stop(surface)
    set(surface, surfaceTransform(scale, y))
}

/** Move a surface without creating a second transform owner on its element. */
export function animateSurfaceTransform(surface: HTMLElement | null, scale: number, y: number, options: ValueAnimationTransition<string>) {

    if (!surface) return null

    stop(surface)

    const values = motion(surface)
    const target = surfaceTransform(scale, y)
    const { onComplete, ...transition } = options

    // `none` and a composed transform look identical at rest but are not
    // compatible complex values. Keep the identity representation while a
    // transition runs, then normalize it back to `none` when it settles.
    if (values.transform.get() === resting) values.transform.jump(entered)

    const animation = animate(values.transform, target === resting ? entered : target, {
        ...transition,
        onComplete: function () {
            values.transform.set(target)
            values.animation = null
            onComplete?.()
        }
    })

    values.animation = animation

    return animation
}

function stop(surface: HTMLElement) {
    const values = motions.get(surface)
    values?.animation?.stop()
    if (values) values.animation = null
}

function set(surface: HTMLElement, target: string) {
    const values = motion(surface)
    values.transform.jump(target)
}

function motion(surface: HTMLElement) {
    const existing = motions.get(surface)

    if (existing) return existing

    const transform = motionValue(resting)
    const values: SurfaceMotion = {
        transform,
        animation: null
    }

    styleEffect(surface, { transform })
    motions.set(surface, values)

    return values
}

function surfaceTransform(scale: number, y: number) {
    return scale === 1 && y === 0 ? resting : `translateY(${y}px) scale(${scale})`
}

interface SurfaceMotion {
    transform: MotionValue<string>
    animation: AnimationPlaybackControlsWithThen | null
}
