import { TransmittedProcess } from "@server/core/link-manager/auth-manager/process-manager/process"
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

    // Private hosting address from the trusted core payload. It never
    // crosses into a framed program's SDK record.
    public readonly assetId: string

    // A real date on this side: the link carries dates rather than
    // stringifying them.
    public readonly startedAt: Date

    // Current live endpoint state mirrored from the authoritative host.
    public server: { ready: boolean } | null

    public client: ClientState | null

    // Retained only as an address. The pane gate verifies that the parent is
    // still live before an SDK handle may resolve it.
    public readonly parent: ProcessRecord | null

    // What its launch said, carried for its whole life.
    public readonly options: Record<string, string>

    public constructor(processManager: ProcessManager, payload: TransmittedProcess) {

        this.processManager = processManager

        this.identity = payload.identity

        this.reference = payload.reference

        this.name = payload.name

        this.program = payload.program

        this.assetId = payload.assetId

        this.startedAt = payload.startedAt

        this.server = payload.server

        this.client = payload.client ? new ClientState(processManager, payload.identity, payload.client) : null

        this.parent = payload.parent

        this.options = payload.options

    }

    // Ending is asked for; the process leaves when its exit echoes.
    public async stop() {

        await this.processManager.$outbound.publish("/stop", this.identity)
    }

    // The program's own words, to its other half.
    public async endEnd(...args: unknown[]) {

        await this.processManager.$outbound.publish("/frame/end-end", this.identity, JSON.stringify(args))
    }

    public serverStarted() {

        this.server = { ready: false }
    }

    public serverStopped() {

        this.server = null
    }

    public clientStarted(payload: TransmittedProcess) {

        if (payload.client) this.client = new ClientState(this.processManager, this.identity, payload.client)
    }

    public clientStopped() {

        this.client = null
    }
}

export interface ProcessRecord {

    readonly reference: string

    readonly identity: string

    readonly name: string | null

    readonly program: string

    readonly options: Record<string, string>

    readonly startedAt: Date

    readonly server: Record<string, never> | null

    readonly client: Record<string, never> | null
}
