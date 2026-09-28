import { Badge, Button, Table, Text, useAppearance, useColor, useScale } from "@phreshos/react-ui"
import { X } from "@phreshos/react-ui/icons"
import type Process from "@client/core/link-manager/auth-manager/process-manager/process"
import usePromise from "@libs/react-promise"
import type Program from "@client/core/link-manager/auth-manager/program-manager/program"
import { ApplicationContext } from "@client/view/contexts"
import programIcon from "@client/view/structure/desktop/programs/program-icon"

/**
 * One live Process as a table row: its Program and name, a mark for each
 * running Endpoint, colored only while it is still starting, and a quiet action
 * to end it. The live list owns removal.
 */
export default function ProcessRow({ process, program, server, client }: Readonly<{
    process: Process
    program: Program | undefined
    server: "starting" | "ready" | null
    client: boolean
}>) {

    const application = ApplicationContext.useValue()

    const space = useScale(useAppearance().spacing)

    const danger = useColor("danger").base

    const ending = usePromise(() => process.exit())

    const label = process.name ?? process.identity

    const failure = ending.exception ? ending.exception.current instanceof Error ? ending.exception.current.message : "Could not end this Process." : null

    return <Table.Row id={process.identity} textValue={`${program?.name ?? process.program} ${label}`}>

        <Table.Cell>
            <span className="flex min-w-0 items-center" style={{ gap: space.small, maxWidth: "100%" }}>
                {program ? <img src={programIcon(application.doors.program, program.assetId)} alt="" draggable={false} style={{ width: space.medium, height: space.medium }} className="shrink-0 object-contain" /> : null}
                <span className="min-w-0 truncate" title={`${program?.name ?? process.program} · ${process.identity}`}>
                    {program?.name ?? process.program} <Text tone="secondary">· {label}</Text>
                </span>
                {/* A failure to end stays beside the Process it belongs to. */}
                {failure && <span role="alert" className="min-w-0 truncate" title={failure} style={{ color: danger }}>{failure}</span>}
            </span>
        </Table.Cell>

        <Table.Cell>
            <span className="flex" style={{ gap: space.xsmall }}>
                {/* Color marks only what needs attention: a running Endpoint is neutral, one still starting is not. */}
                {server && <Badge size="xsmall" color={server === "starting" ? "warning" : undefined} dot={server === "starting"}>Server</Badge>}
                {client && <Badge size="xsmall">Client</Badge>}
            </span>
        </Table.Cell>

        <Table.Cell>
            <Button
                size="xsmall"
                iconOnly
                color="transparent"
                pending={ending.isPending}
                aria-label={`End process ${label}`}
                onPress={() => void ending.safeExecute()}
            ><X style={{ color: danger }} /></Button>
        </Table.Cell>

    </Table.Row>
}
