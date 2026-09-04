import { ProcessSnapshot } from "@server/core/link-manager/auth-manager/process-manager/process"
import ProcessManager from "./process-manager"
import ClientState from "./client-state"

/**
 * A running instance, as this side holds it: rebuilt from what the core
 * transmitted. Its client state owns the Window counterpart while that state
 * is live. Every act is a request; the truth answers with an echo.
 */
export default class Process {

    public readonly processManager: ProcessManager

    public readonly identity: string

    /** Opaque identity of this one Process entity. */
    public readonly reference: string

    public readonly name: string | null

    public readonly program: string

    // A real date on this side: the link carries dates rather than
    // stringifying them.
    public readonly startedAt: Date

    // Current live endpoint state mirrored from the authoritative host.
    public server: { ready: boolean, service: boolean } | null

    public client: ClientState | null

    // Retained lineage from creation. It remains sufficient to reconstruct
    // the same Process handle after the parent leaves the live registry.
    public readonly parent: ProcessRecord | null

    // What its launch said, carried for its whole life.
    public readonly options: Record<string, string>

    public constructor(processManager: ProcessManager, payload: ProcessSnapshot) {

        this.processManager = processManager

        this.identity = payload.identity

        this.reference = payload.reference

        this.name = payload.name

        this.program = payload.program

        this.startedAt = payload.startedAt

        this.server = payload.server

        this.client = payload.client ? new ClientState(processManager, payload.identity, payload.client) : null

        this.parent = payload.parent

        this.options = payload.options

    }

    // Ending is asked for; the process leaves when its exit echoes.
    public async exit() {

        await this.processManager.$outbound.publish("/exit", this.identity)
    }

    // The program's own words, to its other half.
    public async endEnd(...args: unknown[]) {

        await this.processManager.$outbound.publish("/frame/end-end", this.identity, args)
    }

    public serverStarted(payload: ProcessSnapshot) {

        if (payload.server) this.server = payload.server
    }

    public serverStopped() {

        this.server = null
    }

    public clientStarted(payload: ProcessSnapshot) {

        if (!payload.client) return

        // A Process creation snapshot already contains every endpoint that is
        // live at birth. Its following lifecycle announcement describes that
        // same Client; it must update the existing projection rather than
        // inventing a second local incarnation for the Window Manager.
        if (this.client) {

            this.client.window.follow(payload.client.window)

            this.client.sameOrigin = payload.client.sameOrigin

            return
        }

        this.client = new ClientState(this.processManager, this.identity, payload.client)
    }

    public clientStopped() {

        this.client = null
    }

    public clientAccessChanged(payload: ProcessSnapshot) {

        if (this.client && payload.client) this.client.sameOrigin = payload.client.sameOrigin
    }
}

export interface ProcessRecord {

    readonly reference: string

    readonly identity: string

    readonly name: string | null

    readonly program: string

    readonly options: Record<string, string>

    readonly startedAt: Date

    readonly server: { service: boolean } | null

    readonly client: { service: boolean } | null
}
