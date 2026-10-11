import programIcon from "@client/view/structure/desktop/programs/program-icon"
import { ApplicationContext } from "@client/view/contexts"
import type Program from "@client/core/link-manager/auth-manager/program-manager/program"
import { useLaunchPlacement } from "@client/view/structure/desktop/launch-placement"
import { Badge, ContextMenu, GridList, Table, Text, useAppearance, useScale, ScrollArea } from "@phreshos/react-ui"
import { useRef, useState, type ReactElement } from "react"
import Empty from "../empty"
import ProgramMenu from "../../program-menu"
import { useStartMenuSurface } from "../start-menu"

export type ProgramsLayout = "grid" | "list"

/** The Programs the Start Menu shows, as icons or as a table, each opened by a press. */
export default function Programs({ programs, layout, running, empty, onLaunch }: Readonly<{
    programs: readonly Program[]
    layout: ProgramsLayout
    /** How many live Processes each Program has, by its identity. */
    running: ReadonlyMap<string, number>
    empty: string
    onLaunch: (program: Program) => void
}>) {

    const application = ApplicationContext.useValue()

    const space = useScale(useAppearance().spacing)

    const surface = useStartMenuSurface()

    // The Program a press for the menu landed on, found under the pointer as the menu opens.
    const [menuFor, setMenuFor] = useState<Program | null>(null)

    if (!programs.length) return <Empty>{empty}</Empty>

    const byIdentity = new Map(programs.map(program => [program.identity, program]))

    const launch = (identity: string) => { const program = byIdentity.get(identity); if (program) onLaunch(program) }

    const icon = (program: Program) => programIcon(application.doors.program, program.assetId)

    // One menu for the whole list, as Files has: it acts on the Program it was opened on.
    const withMenu = (list: ReactElement) => <ContextMenu>
        <ContextMenu.Trigger>
            <div style={{ display: "contents" }} onContextMenuCapture={event => {
                const key = event.target instanceof Element ? event.target.closest("[data-key]")?.getAttribute("data-key") : null
                setMenuFor(key ? byIdentity.get(key) ?? null : null)
            }}>{list}</div>
        </ContextMenu.Trigger>
        <ContextMenu.Content portalContainer={surface ?? undefined}>
            {menuFor && <ProgramMenu program={menuFor} onOpen={() => onLaunch(menuFor)} />}
        </ContextMenu.Content>
    </ContextMenu>

    if (layout === "grid") return withMenu(<GridList aria-label="Programs" selectionMode="none" itemWidth={space.xlarge * 3.5} style={{ alignContent: "start", outline: "none" }} onAction={key => launch(String(key))}>

        {programs.map(program => <GridList.Item key={program.identity} id={program.identity} textValue={program.name}>

            {/* The description is the tooltip. */}
            <span className="grid min-w-0 justify-items-center text-center" title={program.description ?? undefined} style={{ gap: space.small, paddingBlock: space.small }}>

                <img src={icon(program)} alt="" draggable={false} className="object-contain" style={{ width: space.xlarge * 1.25, height: space.xlarge * 1.25 }} />

                <Text size="small" className="w-full truncate">{program.name}</Text>

            </span>

        </GridList.Item>)}

    </GridList>)

    return withMenu(<ScrollArea axis="horizontal"><Table aria-label="Programs" size="small" onAction={launch}>

        <Table.Header>
            <Table.Column id="name" rowHeader minWidth={space.xlarge * 3}>Name</Table.Column>
            <Table.Column id="version" width={space.xlarge * 3}>Version</Table.Column>
            <Table.Column id="category" width={space.xlarge * 4.5}>Category</Table.Column>
            <Table.Column id="state" width={space.xlarge * 3.5}>State</Table.Column>
        </Table.Header>

        <Table.Body>
            {programs.map(program => <Table.Row key={program.identity} id={program.identity} textValue={program.name}>
                <Table.Cell>
                    <span className="flex min-w-0 items-center" title={program.description ?? undefined} style={{ gap: space.small }}>
                        <img src={icon(program)} alt="" draggable={false} className="shrink-0 object-contain" style={{ width: space.medium * 1.5, height: space.medium * 1.5 }} />
                        <Text truncate>{program.name}</Text>
                    </span>
                </Table.Cell>
                <Table.Cell><Text tone="secondary" className="tabular-nums">{program.version}</Text></Table.Cell>
                <Table.Cell><Text tone="secondary">{program.categories[0] ?? "Other"}</Text></Table.Cell>
                <Table.Cell>{running.get(program.identity) ? <Badge size="xsmall" color="success" dot>{running.get(program.identity)} running</Badge> : null}</Table.Cell>
            </Table.Row>)}
        </Table.Body>

    </Table></ScrollArea>)
}

/**
 * Opens a Program. A Program that declares where its Window goes keeps it; otherwise the Window opens
 * where this Desktop looks, with a square size of this Desktop's choosing when the Program declares none.
 */
export function useLaunch() {

    // Read when the launch happens, not when the menu first rendered: the view may have moved since.
    const currentPlacement = useLaunchPlacement()

    const placement = useRef(currentPlacement)

    placement.current = currentPlacement

    return async function (program: Program) {

        // A Program without a Client opens as it declares: there is no Window to place.
        if (!program.client) return void await program.createProcess()

        const declared = program.client.position ?? null

        const size = program.client.size ?? null

        const placed = placement.current.place(size)

        // A Window that opens where its Program declares is brought into view.
        if (declared) placement.current.reveal(declared, placed.size ?? size)

        await program.createProcess({ client: declared ? (placed.size ? { size: placed.size } : {}) : placed })
    }
}
