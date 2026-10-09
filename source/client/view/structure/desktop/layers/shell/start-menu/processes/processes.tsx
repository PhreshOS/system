import type Process from "@client/core/link-manager/auth-manager/process-manager/process"
import type Program from "@client/core/link-manager/auth-manager/program-manager/program"
import ProcessRow from "./process-item"
import { Table, useAppearance, useScale, ScrollArea } from "@phreshos/react-ui"
import Empty from "../empty"

/** Live Processes, including those without a Client window, as a table. */
export default function Processes({ processes, programs, empty }: Readonly<{
    processes: readonly Process[]
    programs: ReadonlyMap<string, Program>
    empty: string
}>) {

    const space = useScale(useAppearance().spacing)

    if (!processes.length) return <Empty>{empty}</Empty>

    // A fixed layout keeps the table within the content: a long Process name is cut short instead of widening it.
    return <ScrollArea axis="horizontal"><Table aria-label="Processes" size="small">

        <Table.Header>
            <Table.Column id="process" rowHeader minWidth={space.xlarge * 3}>Process</Table.Column>
            <Table.Column id="program" width={space.xlarge * 4}>Program</Table.Column>
            <Table.Column id="endpoints" width={space.xlarge * 5}>Endpoints</Table.Column>
            <Table.Column id="end" aria-label="End" width={space.xlarge * 2.5}> </Table.Column>
        </Table.Header>

        <Table.Body>
            {/* Endpoint state is passed as values: the Process handle is updated in place, so the row must see what changed. */}
            {processes.map(process => <ProcessRow key={process.identity} process={process} program={programs.get(process.program)}
                server={process.server ? process.server.ready ? "ready" : "starting" : null} client={process.client !== null} />)}
        </Table.Body>

    </Table></ScrollArea>
}
