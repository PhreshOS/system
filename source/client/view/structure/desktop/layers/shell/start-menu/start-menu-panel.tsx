import { type ReactNode } from "react"
import { Surface } from "@phreshos/react-ui"
import SystemHeader from "@client/view/components/system-header"

/** The built-in Start Menu content shown by the default Shell. */
export default function StartMenuPanel({ labelId, name, version, left, right, footer }: Readonly<{
    labelId: string
    name: string
    version: string
    left: ReactNode
    right: ReactNode
    footer: ReactNode
}>) {

    const spacing = 8

    return <Surface material="full" style={{ display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", minHeight: 0, height: "100%", maxHeight: "inherit", overflow: "hidden" }}>

        <div className="grid h-10 shrink-0 items-center px-3.5"><SystemHeader labelId={labelId} name={name} version={version} /></div>

        <div className="grid min-h-0 min-w-0" style={{ gridTemplateRows: "minmax(0, 1fr) auto", gap: spacing, padding: spacing, paddingTop: 0 }}>

            <div className="grid min-h-0 min-w-0 grid-cols-2" style={{ gap: "inherit" }}>

                <Surface material="extended" className="min-h-0 min-w-0 overflow-hidden">{left}</Surface>

                <Surface material="extended" className="min-h-0 min-w-0 overflow-hidden">{right}</Surface>

            </div>

            {footer}

        </div>

    </Surface>
}
