import { type ProcessSnapshot } from "@server/core/link-manager/auth-manager/process-manager/process"
import Window from "./window"

/** One desktop counterpart of the server-authoritative client state. */
export default class ClientState {

    public readonly window: Window

    public sameOrigin: boolean

    public readonly service: NonNullable<ProcessSnapshot["client"]>["service"]

    public constructor(window: Window, payload: NonNullable<ProcessSnapshot["client"]>) {

        this.window = window

        this.sameOrigin = payload.sameOrigin

        this.service = payload.service
    }
}
