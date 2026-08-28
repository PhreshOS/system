import ReducedMotion from "@libs/react-motion"
import { standardAppearance } from "@phreshos/core"
import { ThemeProvider } from "next-themes"
import { ReactNode } from "react"
import "./appearance.css"

export default function ({ children, reducedMotion }: AppearanceProps) {

    return <ThemeProvider attribute="class" defaultTheme="system">

        <ReducedMotion reduced={reducedMotion}>

            <div className="relative isolate grid h-dvh overflow-hidden font-roboto" style={{ backgroundColor: standardAppearance.background.light }}>

                {children}

            </div>

        </ReducedMotion>

    </ThemeProvider>
}

interface AppearanceProps {

    children: ReactNode

    reducedMotion?: boolean
}
