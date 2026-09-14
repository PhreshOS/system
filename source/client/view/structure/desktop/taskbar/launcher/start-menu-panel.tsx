import { type ReactNode } from "react"
import { Surface } from "@phreshos/react-ui"
import SystemHeader from "../../../../components/system-header"

/** Start menu shell: one outer material and two independently scrolling halves. */
export default function StartMenuPanel({ labelId, name, version, left, right, footer }: Readonly<{ labelId: string, name: string, version: string, left: ReactNode, right: ReactNode, footer: ReactNode }>) {

    const spacing = 8

    return <Surface style={{ display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", minHeight: 0, height: "100%", maxHeight: "inherit", overflow: "hidden" }}>

        <SystemHeader labelId={labelId} name={name} version={version} />

        <div className="grid min-h-0 min-w-0" style={{ gridTemplateRows: "minmax(0, 1fr) auto", gap: spacing, padding: spacing, paddingTop: 0 }}>

            <div className="grid min-h-0 min-w-0 grid-cols-2" style={{ gap: "inherit" }}>

                <Surface className="min-h-0 min-w-0 overflow-hidden">{left}</Surface>

                <Surface className="min-h-0 min-w-0 overflow-hidden">{right}</Surface>

            </div>

            {footer}

        </div>

    </Surface>
}
