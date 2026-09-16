import useStorage from "@libs/storage-hook"
import {
    defaultAppearance,
    type AppearanceTransaction,
    type DesktopPreferences,
    type DesktopPreferencesUpdate,
    type Theme
} from "@phreshos/core"
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { transitionTheme } from "./theme-transition"

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
    const desiredTheme = selectedTheme(storedTheme.value, nativeDark)
    const desiredAnimations = selectedAnimations(storedAnimations.value, nativeReducedMotion)
    const desired = useMemo<DesktopPreferences>(() => ({ theme: desiredTheme, animations: desiredAnimations }), [desiredAnimations, desiredTheme])
    const [preferences, setPreferences] = useState(desired)
    const current = useRef(preferences)
    const pending = useRef<PendingCommit | null>(null)
    const revision = useRef(0)
    const transaction = useRef<AppearanceTransaction>(defaultAppearance.transaction)

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

    const setTransaction = useCallback(function (value: AppearanceTransaction) {
        transaction.current = value
    }, [])

    useEffect(() => {
        if (samePreferences(current.current, desired)) return

        pending.current?.resolve()
        pending.current = null

        const change = ++revision.current
        const themeChanged = current.current.theme !== desired.theme

        if (!themeChanged) {
            setPreferences(desired)
            return
        }

        void transitionTheme(document, transaction.current, desired.animations, async () => {
            if (revision.current !== change) return

            await new Promise<void>(resolve => {
                pending.current = { preferences: desired, resolve }
                setPreferences(desired)
            })
        })
    }, [desired])

    useLayoutEffect(() => {
        const root = document.documentElement
        const previous = root.style.colorScheme

        current.current = preferences
        root.style.colorScheme = preferences.theme

        const commit = pending.current

        if (commit && samePreferences(commit.preferences, preferences)) {
            pending.current = null
            queueMicrotask(commit.resolve)
        }

        return () => { root.style.colorScheme = previous }
    }, [preferences])

    useEffect(() => () => {
        pending.current?.resolve()
        pending.current = null
    }, [])

    const owner = useMemo(() => ({ preferences, update, setTransaction }), [preferences, update, setTransaction])

    return <DesktopPreferencesContext.Provider value={owner}>{children}</DesktopPreferencesContext.Provider>
}

/** Reads the complete effective state and its View-owned update operation. */
export function useDesktopPreferences() {
    const owner = useContext(DesktopPreferencesContext)
    if (!owner) throw new Error("useDesktopPreferences() requires DesktopPreferencesProvider")
    return owner
}

/** Supplies the active Appearance timing to the Desktop-owned theme transition. */
export function useDesktopThemeTransaction(transaction: AppearanceTransaction) {
    const owner = useDesktopPreferences()

    useLayoutEffect(() => {
        owner.setTransaction(transaction)
    }, [owner, transaction])
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
    readonly setTransaction: (transaction: AppearanceTransaction) => void
}

interface PendingCommit {
    readonly preferences: DesktopPreferences
    readonly resolve: () => void
}

function samePreferences(first: DesktopPreferences, second: DesktopPreferences) {
    return first.theme === second.theme && first.animations === second.animations
}
