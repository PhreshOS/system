import gsap from "gsap"

const entered = { scale: 1, y: 0 }

const entering = { scale: 0.92, y: 14 }

/** Establish the first frame before a glass surface becomes visible. */
export function prepareSurfaceEntrance(surface: HTMLElement | null, reducedMotion: boolean) {

    if (!surface) return

    gsap.killTweensOf(surface)

    gsap.set(surface, reducedMotion ? entered : entering)
}

/** Give every system glass surface the same entrance motion. */
export function enterSurface(surface: HTMLElement | null, reducedMotion: boolean) {

    if (!surface) return null

    gsap.killTweensOf(surface)

    if (reducedMotion) {

        gsap.set(surface, entered)

        return null
    }

    return gsap.to(surface, { ...entered, duration: 0.24, ease: "back.out(1.6)" })
}

/** Stop presence motion and leave the surface ready for its next entrance. */
export function restSurface(surface: HTMLElement | null) {

    if (!surface) return

    gsap.killTweensOf(surface)

    gsap.set(surface, entered)
}
