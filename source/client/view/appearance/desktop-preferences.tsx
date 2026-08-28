import useStorage from "@libs/storage-hook"
import {
    type DesktopPreferences,
    type DesktopPreferencesUpdate,
    type Theme
} from "@phreshos/core"
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useSyncExternalStore, type ReactNode } from "react"

const themeQuery = "(prefers-color-scheme: dark)"
const reducedMotionQuery = "(prefers-reduced-motion: reduce)"
const themeKey = "desktop-preferences:theme"
const animationsKey = "desktop-preferences:animations"

const DesktopPreferencesContext = createContext<DesktopPreferencesOwner | null>(null)

/** Owns this browser Desktop's persisted choices and native defaults. */
export default function DesktopPreferencesProvider({ children }: Readonly<{ children: ReactNode }>) {
    const storedTheme = useStorage(themeKey)
    const storedAnimations = useStorage(animationsKey)
    const nativeDark = useMediaPreference(themeQuery)
    const nativeReducedMotion = useMediaPreference(reducedMotionQuery)
    const theme = selectedTheme(storedTheme.value, nativeDark)
    const animations = selectedAnimations(storedAnimations.value, nativeReducedMotion)
    const preferences = useMemo<DesktopPreferences>(() => ({ theme, animations }), [animations, theme])

    const update = useCallback(function (change: DesktopPreferencesUpdate) {
        if (change.theme !== undefined) {
            if (change.theme === "default") storedTheme.remove()
            else storedTheme.update(change.theme)
        }

        if (change.animations !== undefined) {
            if (change.animations === "default") storedAnimations.remove()
            else storedAnimations.update(change.animations ? "enabled" : "disabled")
        }
    }, [storedAnimations.remove, storedAnimations.update, storedTheme.remove, storedTheme.update])

    useLayoutEffect(() => {
        const root = document.documentElement
        const previous = root.style.colorScheme

        root.style.colorScheme = preferences.theme

        return () => { root.style.colorScheme = previous }
    }, [preferences.theme])

    const owner = useMemo(() => ({ preferences, update }), [preferences, update])

    return <DesktopPreferencesContext.Provider value={owner}>{children}</DesktopPreferencesContext.Provider>
}

/** Reads the complete effective state and its View-owned update operation. */
export function useDesktopPreferences() {
    const owner = useContext(DesktopPreferencesContext)
    if (!owner) throw new Error("useDesktopPreferences() requires DesktopPreferencesProvider")
    return owner
}

function selectedTheme(value: string | null, nativeDark: boolean): Theme {
    return value === "light" || value === "dark" ? value : nativeDark ? "dark" : "light"
}

function selectedAnimations(value: string | null, nativeReducedMotion: boolean) {
    if (value === "enabled") return true
    if (value === "disabled") return false
    return !nativeReducedMotion
}

function useMediaPreference(query: string) {
    const media = useMemo(() => matchMedia(query), [query])
    return useSyncExternalStore(
        change => {
            media.addEventListener("change", change)
            return () => media.removeEventListener("change", change)
        },
        () => media.matches,
        () => false
    )
}

interface DesktopPreferencesOwner {
    readonly preferences: DesktopPreferences
    readonly update: (change: DesktopPreferencesUpdate) => void
}
