import { AuthManagerContext } from "@client/view/contexts"
import { useLayoutEffect, useState } from "react"

/** Every live Process, including those without a Client window, and every Program they belong to. */
export default function useLive() {

    const manager = AuthManagerContext.useValue().processManager

    const programManager = manager.authManager.programManager

    const [processes, setProcesses] = useState(() => [...manager.processes.values()])

    const [programs, setPrograms] = useState(() => [...programManager.programs.values()])

    useLayoutEffect(() => manager.subscribeProcesses(setProcesses), [manager])

    useLayoutEffect(() => programManager.subscribePrograms(setPrograms), [programManager])

    return { processes, programs: new Map(programs.map(program => [program.identity, program])) }
}
