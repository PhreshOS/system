import { type ReactNode } from "react"
import { Surface } from "@phreshos/react-ui"
import SystemHeader from "../../../../components/system-header"

/** One persistent Start Menu Surface whose contents may be supplied by a Client Endpoint. */
export default function StartMenuPanel({ labelId, name, version, left, right, footer, replacement }: Readonly<{
    labelId: string
    name: string
    version: string
    left: ReactNode
    right: ReactNode
    footer: ReactNode
    replacement?: ReactNode
}>) {

    const spacing = 8

    return <Surface style={{ display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", minHeight: 0, height: "100%", maxHeight: "inherit", overflow: "hidden" }}>

        {replacement ? <>

            <h2 id={labelId} className="sr-only">{name}</h2>

            {replacement}

        </> : <>

            <SystemHeader labelId={labelId} name={name} version={version} />

            <div className="grid min-h-0 min-w-0" style={{ gridTemplateRows: "minmax(0, 1fr) auto", gap: spacing, padding: spacing, paddingTop: 0 }}>

                <div className="grid min-h-0 min-w-0 grid-cols-2" style={{ gap: "inherit" }}>

                    <Surface className="min-h-0 min-w-0 overflow-hidden">{left}</Surface>

                    <Surface className="min-h-0 min-w-0 overflow-hidden">{right}</Surface>

                </div>

                {footer}

            </div>

        </>}

    </Surface>
}
