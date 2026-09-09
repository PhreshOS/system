import { ReactTunnel } from "@the-link/react"
import { AuthManagerContext } from "@client/view/contexts"
import ProcessItem from "./process-item"
import { matchesProcess } from "../search"

/** All live Processes, including those without a Client window. */
export default function Processes({ terms }: Readonly<{ terms: readonly string[] }>) {

    const manager = AuthManagerContext.useValue().processManager

    const inbound = ReactTunnel.useFactory(manager.$inbound)

    const processes = inbound.useFirstState("/processes", [...manager.processes.values()])

    const programManager = manager.authManager.programManager

    const programsInbound = ReactTunnel.useFactory(programManager.$inbound)

    const programs = programsInbound.useFirstState("/programs", [...programManager.programs.values()])

    const programsByIdentity = new Map(programs.map(program => [program.identity, program]))

    const matching = processes.filter(process => matchesProcess(process.name, programsByIdentity.get(process.program), terms))

    return <div role="group" aria-label="Processes" className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] p-2">

        <h3 className="px-3 py-2 text-xs font-medium opacity-60">Processes · {matching.length}</h3>

        {matching.length ? <ul className="m-0 min-h-0 list-none overflow-y-auto p-0">

            {matching.map(process => <ProcessItem key={process.identity} process={process} program={programsByIdentity.get(process.program)} />)}

        </ul> : <p className="m-0 grid min-h-32 place-items-center px-3 py-8 text-center text-sm opacity-50">{terms.length ? "No matching Processes" : "No Processes"}</p>}

    </div>
}
