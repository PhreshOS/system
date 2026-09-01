import { ReactTunnel } from "@the-link/react"
import { AuthManagerContext } from "@client/view/contexts"

/**
 * The authorized view's programs: the list the peer re-emits on its
 * tunnel, mirrored into React state — initial value derived from the
 * born-whole Map, updates from the "/programs" event.
 */
export default function usePrograms() {

    const authManager = AuthManagerContext.useValue()

    const inbound = ReactTunnel.useFactory(authManager.programManager.$inbound)

    return inbound.useFirstState("/programs", [...authManager.programManager.programs.values()]).filter(program => program.installed)
}
