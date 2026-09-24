import { AuthManagerContext } from "@client/view/contexts"
import { useLayoutEffect, useState } from "react"

/**
 * The authorized view's programs: the list the peer re-emits on its
 * tunnel, mirrored into React state — initial value derived from the
 * born-whole Map, updates from the "/programs" event.
 */
export default function usePrograms() {

    const authManager = AuthManagerContext.useValue()

    const manager = authManager.programManager

    const [programs, setPrograms] = useState(() => [...manager.programs.values()])

    useLayoutEffect(() => manager.subscribePrograms(setPrograms), [manager])

    return programs.filter(program => program.installed)
}
