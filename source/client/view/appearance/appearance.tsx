import ReducedMotion from "@libs/react-motion"
import { standardAppearance } from "@phreshos/core"
import { ReactNode } from "react"
import DesktopPreferencesProvider, { useDesktopPreferences } from "./desktop-preferences"
import "./appearance.css"

export default function ({ children }: AppearanceProps) {

    return <DesktopPreferencesProvider>

        <AppearanceRoot>{children}</AppearanceRoot>

    </DesktopPreferencesProvider>
}

function AppearanceRoot({ children }: AppearanceProps) {
    const { preferences } = useDesktopPreferences()
    const background = standardAppearance.background[preferences.theme]

    return <ReducedMotion reduced={!preferences.animations}>

        <div className="relative isolate grid h-dvh overflow-hidden font-roboto" style={{ backgroundColor: background }}>

            {children}

        </div>

    </ReducedMotion>
}

interface AppearanceProps {

    children: ReactNode
}
