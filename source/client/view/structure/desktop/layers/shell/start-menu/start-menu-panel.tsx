import { type ReactNode } from "react"
import { Panel, Surface, useAppearance, useScale } from "@phreshos/react-ui"
import SystemHeader from "@client/view/components/system-header"

/**
 * The built-in Start Menu content shown by the default Shell: a frosted Panel
 * whose header is the same row as a Window's, holding three wells recessed into
 * it, the Programs, the Processes, and the search field below them. Every space
 * is the Appearance spacing, the same as the header's side padding, so the wells
 * line up with the header's content.
 */
export default function StartMenuPanel({ labelId, name, version, left, right, footer }: Readonly<{
    labelId: string
    name: string
    version: string
    left: ReactNode
    right: ReactNode
    footer: ReactNode
}>) {

    const space = useScale(useAppearance().spacing)

    return <Panel style={{ height: "100%", maxHeight: "inherit" }}>

        <Panel.Header><SystemHeader labelId={labelId} name={name} version={version} /></Panel.Header>

        <div className="grid min-h-0 min-w-0" style={{ gridTemplateRows: "minmax(0, 1fr) auto", gap: space.medium, padding: space.medium, paddingTop: 0 }}>

            <div className="grid min-h-0 min-w-0 grid-cols-2" style={{ gap: space.medium }}>

                <Well>{left}</Well>

                <Well>{right}</Well>

            </div>

            {footer}

        </div>

    </Panel>
}

/** A list recessed into the menu, painted as the search field is. */
function Well({ children }: Readonly<{ children: ReactNode }>) {

    return <Surface depth="recessed" color="background" material={wellMaterial} className="min-h-0 min-w-0 overflow-hidden">{children}</Surface>
}

/** The wells, the lists and the search field alike, take the Appearance material's opacity. */
export const wellMaterial = "extended"
