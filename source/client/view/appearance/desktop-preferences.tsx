import useStorage from "@libs/storage-hook"
import {
    desktopPreferencesLimits,
    defaultDesktopScale,
    type Transaction,
    type DesktopPreferences,
    type DesktopPreferencesUpdate,
    type ResolvedDesktopPreferences,
    type Theme
} from "@phreshos/core"
import { timing } from "@phreshos/react-ui"
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { transitionTheme } from "./theme-transition"

const themeQuery = "(prefers-color-scheme: dark)"
const reducedMotionQuery = "(prefers-reduced-motion: reduce)"
const themeKey = "desktop-preferences:theme"
const animationsKey = "desktop-preferences:animations"
const scaleKey = "desktop-preferences:scale"

const DesktopPreferencesContext = createContext<DesktopPreferencesOwner | null>(null)

/** Owns this browser Desktop's persisted choices, and what they resolve to with its browser. */
export default function DesktopPreferencesProvider({ children }: Readonly<{ children: ReactNode }>) {
    const storedTheme = useStorage(themeKey)
    const storedAnimations = useStorage(animationsKey)
    const storedScale = useStorage(scaleKey)
    const nativeDark = useMediaPreference(themeQuery)
    const nativeReducedMotion = useMediaPreference(reducedMotionQuery)
    const chosenTheme = chosenThemeOf(storedTheme.value)
    const chosenAnimations = chosenAnimationsOf(storedAnimations.value)
    const scale = resolveStoredDesktopScale(storedScale.value)
    const preferences = useMemo<DesktopPreferences>(() => ({ theme: chosenTheme, animations: chosenAnimations, scale }), [chosenAnimations, chosenTheme, scale])
    const desiredTheme: Theme = chosenTheme === "browser" ? nativeDark ? "dark" : "light" : chosenTheme
    const desiredAnimations = chosenAnimations === "browser" ? !nativeReducedMotion : chosenAnimations
    const desired = useMemo<ResolvedDesktopPreferences>(() => ({ theme: desiredTheme, animations: desiredAnimations, scale }), [desiredAnimations, scale, desiredTheme])
    const [resolved, setResolved] = useState(desired)
    const current = useRef(resolved)
    const pending = useRef<PendingCommit | null>(null)
    const revision = useRef(0)
    const transaction = useRef<Transaction>(timing("change"))

    const update = useCallback(function (change: DesktopPreferencesUpdate) {
        if (change.theme !== undefined) {
            if (change.theme === "browser") storedTheme.remove()
            else storedTheme.update(change.theme)
        }

        if (change.animations !== undefined) {
            if (change.animations === "browser") storedAnimations.remove()
            else storedAnimations.update(change.animations ? "enabled" : "disabled")
        }

        if (change.scale !== undefined) storedScale.update(String(change.scale))
    }, [storedAnimations.remove, storedAnimations.update, storedScale.update, storedTheme.remove, storedTheme.update])

    const setTransaction = useCallback(function (value: Transaction) {
        transaction.current = value
    }, [])

    useEffect(() => {
        if (samePreferences(current.current, desired)) return

        pending.current?.resolve()
        pending.current = null

        const change = ++revision.current
        const themeChanged = current.current.theme !== desired.theme

        if (!themeChanged) {
            setResolved(desired)
            return
        }

        void transitionTheme(document, transaction.current, desired.animations, async () => {
            if (revision.current !== change) return

            await new Promise<void>(resolve => {
                pending.current = { resolved: desired, resolve }
                setResolved(desired)
            })
        })
    }, [desired])

    useLayoutEffect(() => {
        const root = document.documentElement
        const previous = root.style.colorScheme

        current.current = resolved
        root.style.colorScheme = resolved.theme

        const commit = pending.current

        if (commit && samePreferences(commit.resolved, resolved)) {
            pending.current = null
            queueMicrotask(commit.resolve)
        }

        return () => { root.style.colorScheme = previous }
    }, [resolved])

    useEffect(() => () => {
        pending.current?.resolve()
        pending.current = null
    }, [])

    const owner = useMemo(() => ({ preferences, resolved, update, setTransaction }), [preferences, resolved, update, setTransaction])

    return <DesktopPreferencesContext.Provider value={owner}>{children}</DesktopPreferencesContext.Provider>
}

/** Reads what was chosen, what it resolves to, and the View-owned update operation. */
export function useDesktopPreferences() {
    const owner = useContext(DesktopPreferencesContext)
    if (!owner) throw new Error("useDesktopPreferences() requires DesktopPreferencesProvider")
    return owner
}

/** Supplies the motion of a change in place to the Desktop-owned theme transition. */
export function useDesktopThemeTransaction(transaction: Transaction) {
    const owner = useDesktopPreferences()

    useLayoutEffect(() => {
        owner.setTransaction(transaction)
    }, [owner, transaction])
}

// Following the browser is kept as no stored value at all.
function chosenThemeOf(value: string | null): DesktopPreferences["theme"] {
    return value === "light" || value === "dark" ? value : "browser"
}

function chosenAnimationsOf(value: string | null): DesktopPreferences["animations"] {
    if (value === "enabled") return true
    if (value === "disabled") return false
    return "browser"
}

/** Reads the scale from this Desktop's persisted representation. */
export function resolveStoredDesktopScale(value: string | null) {
    const scale = Number(value)
    const { minimum, maximum } = desktopPreferencesLimits.scale
    return value !== null && Number.isFinite(scale) && scale >= minimum && scale <= maximum ? scale : defaultDesktopScale
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
    readonly resolved: ResolvedDesktopPreferences
    readonly update: (change: DesktopPreferencesUpdate) => void
    readonly setTransaction: (transaction: Transaction) => void
}

interface PendingCommit {
    readonly resolved: ResolvedDesktopPreferences
    readonly resolve: () => void
}

function samePreferences(first: ResolvedDesktopPreferences, second: ResolvedDesktopPreferences) {
    return first.theme === second.theme && first.animations === second.animations && first.scale === second.scale
}
