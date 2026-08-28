import DesktopPreferencesProvider, { useDesktopPreferences } from "./desktop-preferences"
import { standardAppearance } from "@phreshos/core"
import ReducedMotion from "@libs/react-motion"
import { PropsWithChildren } from "react"
import "./appearance.css"

export default function ({ children }: PropsWithChildren) {

    return <DesktopPreferencesProvider>

        <AppearanceRoot>{children}</AppearanceRoot>

    </DesktopPreferencesProvider>
}

function AppearanceRoot({ children }: PropsWithChildren) {
    const { preferences } = useDesktopPreferences()
    const background = standardAppearance.background[preferences.theme]

    return <ReducedMotion reduced={!preferences.animations}>

        <div className="relative isolate grid h-dvh overflow-hidden font-roboto" style={{ backgroundColor: background }}>

            {children}

        </div>

    </ReducedMotion>
}
