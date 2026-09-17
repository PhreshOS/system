import DesktopPreferencesProvider, { useDesktopPreferences, useDesktopThemeTransaction } from "./desktop-preferences"
import { defaultAppearance, parseAppearance, type Appearance } from "@phreshos/core"
import { UIProvider } from "@phreshos/react-ui"
import ReducedMotion from "@libs/react-motion"
import { createContext, type PropsWithChildren, useCallback, useContext, useLayoutEffect, useState } from "react"
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
    const { preferences } = useDesktopPreferences()
    const [appearance, setAppearance] = useState(() => resolveStoredAppearance(localStorage.getItem(appearanceKey)))
    const remember = useCallback(function (value: Appearance) {
        setAppearance(value)
        localStorage.setItem(appearanceKey, JSON.stringify(value))
    }, [])
    const background = appearance.colors[preferences.theme].background

    useDesktopThemeTransaction(appearance.transaction)

    return <RememberAppearanceContext.Provider value={remember}>

        <UIProvider appearance={appearance} preferences={preferences}>

            <DesktopScaleProvider scale={preferences.scale}>

                <div className="relative isolate h-dvh overflow-hidden" style={{ backgroundColor: background }}>

                    <ReducedMotion reduced={!preferences.animations}>

                        <div
                            className="absolute top-0 left-0 isolate grid font-roboto"
                            style={{ width: "100%", height: "100%", zoom: preferences.scale }}
                        >

                            {children}

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

/** Restores one complete cached Appearance or falls back to the System default. */
export function resolveStoredAppearance(value: string | null): Appearance {
    if (value === null) return defaultAppearance

    try {
        return parseAppearance(JSON.parse(value))
    }
    catch {
        return defaultAppearance
    }
}
