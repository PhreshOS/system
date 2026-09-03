import { type ProcessSnapshot } from "@server/core/link-manager/auth-manager/process-manager/process"
import ProcessManager from "./process-manager"
import Window from "./window"

/** One desktop counterpart of the server-authoritative client state. */
export default class ClientState {

    public readonly window: Window

    public sameOrigin: boolean

    public constructor(processManager: ProcessManager, process: string, payload: NonNullable<ProcessSnapshot["client"]>) {

        this.window = new Window(processManager, process, payload.window)

        this.sameOrigin = payload.sameOrigin
    }
}
