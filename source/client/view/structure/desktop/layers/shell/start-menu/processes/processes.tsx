import { AuthManagerContext } from "@client/view/contexts"
import ProcessRow from "./process-item"
import { matchesProcess } from "../search"
import Section from "../section"
import { Table, useAppearance, useScale } from "@phreshos/react-ui"
import { useLayoutEffect, useState } from "react"

/** All live Processes, including those without a Client window, as a small table. */
export default function Processes({ terms }: Readonly<{ terms: readonly string[] }>) {

    const manager = AuthManagerContext.useValue().processManager

    const [processes, setProcesses] = useState(() => [...manager.processes.values()])

    const programManager = manager.authManager.programManager

    const [programs, setPrograms] = useState(() => [...programManager.programs.values()])

    useLayoutEffect(() => manager.subscribeProcesses(setProcesses), [manager])

    useLayoutEffect(() => programManager.subscribePrograms(setPrograms), [programManager])

    const programsByIdentity = new Map(programs.map(program => [program.identity, program]))

    const space = useScale(useAppearance().spacing)

    const matching = processes.filter(process => matchesProcess(process.name, programsByIdentity.get(process.program), terms))

    return <Section label="Processes" count={matching.length} empty={terms.length ? "No matching Processes" : "No Processes"}>

        {/* A fixed layout keeps the table in its well: a long Process name is cut short instead of widening it. */}
        <Table aria-label="Processes" size="small" style={{ minWidth: 0, tableLayout: "fixed" }}>

            <Table.Header>
                <Table.Column id="process" rowHeader>Process</Table.Column>
                <Table.Column id="endpoints" style={{ width: space.xlarge * 5 }}>Running</Table.Column>
                <Table.Column id="end" aria-label="End" style={{ width: space.xlarge * 2 }}> </Table.Column>
            </Table.Header>

            <Table.Body>
                {/* Endpoint state is passed as values: the Process handle is updated in place, so the row must see what changed. */}
                {matching.map(process => <ProcessRow key={process.identity} process={process} program={programsByIdentity.get(process.program)}
                    server={process.server ? process.server.ready ? "ready" : "starting" : null} client={process.client !== null} />)}
            </Table.Body>

        </Table>

    </Section>
}
