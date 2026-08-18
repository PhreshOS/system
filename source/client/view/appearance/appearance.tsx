import ReducedMotion from "@libs/react-motion"
import { standardTheme } from "@phreshos/core"
import { ReactNode } from "react"
import "./appearance.css"

export default function ({ children, reducedMotion }: AppearanceProps) {

    return <ReducedMotion reduced={reducedMotion}>

        <div className="relative isolate grid h-dvh overflow-hidden font-roboto" style={{ backgroundColor: standardTheme.background }}>

            <div className="relative grid min-h-0">

                {children}

            </div>

        </div>

    </ReducedMotion>
}

interface AppearanceProps {

    children: ReactNode

    reducedMotion?: boolean
}
