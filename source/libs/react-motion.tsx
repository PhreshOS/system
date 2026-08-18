import { ReactNode, createContext, useContext, useSyncExternalStore } from "react"

const ReducedMotionContext = createContext(false)

const media = "(prefers-reduced-motion: reduce)"

let preference: MediaQueryList | null = null

/** Provides the operating-system motion preference with an optional override. */
export default function ReducedMotion({ children, reduced }: ReducedMotionProps) {

    const preferred = useSyncExternalStore(subscribe, snapshot, () => false)

    return <ReducedMotionContext.Provider value={reduced ?? preferred}>{children}</ReducedMotionContext.Provider>
}

export function useReducedMotion() {

    return useContext(ReducedMotionContext)
}

function subscribe(change: () => void) {

    const query = motionPreference()

    query?.addEventListener("change", change)

    return () => query?.removeEventListener("change", change)
}

function snapshot() {

    return motionPreference()?.matches ?? false
}

function motionPreference() {

    if (typeof window === "undefined" || !window.matchMedia) return null

    preference ??= window.matchMedia(media)

    return preference
}

interface ReducedMotionProps {

    children: ReactNode

    /** A deterministic environment may override the operating-system preference. */
    reduced?: boolean
}
