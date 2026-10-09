import DesktopPreferencesProvider, { useDesktopPreferences, useDesktopThemeTransaction } from "./desktop-preferences"
import { applyAppearanceUpdate, defaultAppearance, type Appearance, type Transaction } from "@phreshos/core"
import { timing, UIProvider } from "@phreshos/react-ui"
import ReducedMotion from "@libs/react-motion"
import { createContext, type PropsWithChildren, useCallback, useContext, useLayoutEffect, useMemo, useState } from "react"
import { DesktopScaleProvider } from "../structure/desktop/desktop-scale"
import "./appearance.css"

const appearanceKey = "appearance"
const RememberAppearanceContext = createContext<((appearance: Appearance) => void) | null>(null)

export default function ({ children }: PropsWithChildren) {

    return <DesktopPreferencesProvider>

        <AppearanceRoot>{children}</AppearanceRoot>

    </DesktopPreferencesProvider>
}

function AppearanceRoot({ children }: PropsWithChildren) {
    const { resolved } = useDesktopPreferences()
    const [appearance, setAppearance] = useState(() => resolveStoredAppearance(localStorage.getItem(appearanceKey)))
    const [overlays, setOverlays] = useState<HTMLDivElement | null>(null)
    const remember = useCallback(function (value: Appearance) {
        setAppearance(value)
        localStorage.setItem(appearanceKey, JSON.stringify(value))
    }, [])
    const background = appearance.colors[resolved.theme].background

    // A theme turns the whole screen: it fades five times as long as a change in place, softly at
    // both ends, so the eye follows it instead of being struck by it.
    const change = timing("change", { tempo: appearance.tempo })
    const themeChange = useMemo<Transaction>(() => ({ duration: change.duration * 5, easing: "ease-in-out" }), [change])
    useDesktopThemeTransaction(themeChange)

    return <RememberAppearanceContext.Provider value={remember}>

        <UIProvider appearance={appearance} preferences={resolved}>

            <DesktopScaleProvider scale={resolved.scale} container={overlays}>

                <div className="relative isolate h-dvh overflow-hidden" style={{ backgroundColor: background }}>

                    <ReducedMotion reduced={!resolved.animations}>

                        <div
                            className="absolute top-0 left-0 isolate grid font-roboto"
                            style={{ width: "100%", height: "100%", zoom: resolved.scale }}
                        >

                            {children}

                            {/* Desktop overlays open here: inside the scale, so they share it, and outside the
                                layout, so opening one never takes room from the Desktop. It has no size and
                                catches nothing; what opens in it floats from its corner. */}
                            <div ref={setOverlays} className="absolute top-0 left-0 size-0 overflow-visible" />

                        </div>

                    </ReducedMotion>

                </div>

            </DesktopScaleProvider>

        </UIProvider>

    </RememberAppearanceContext.Provider>
}

/** Replaces the provisional browser snapshot with an authoritative System Appearance. */
export function useRememberSystemAppearance(appearance: Appearance) {
    const remember = useContext(RememberAppearanceContext)

    if (!remember) throw new Error("useRememberSystemAppearance() requires the Desktop Appearance owner")

    useLayoutEffect(() => remember(appearance), [appearance, remember])
}

/** Resolves cached Appearance overrides against the current System default. */
export function resolveStoredAppearance(value: string | null): Appearance {
    if (value === null) return defaultAppearance

    try {
        return applyAppearanceUpdate(defaultAppearance, JSON.parse(value))
    }
    catch {
        return defaultAppearance
    }
}
