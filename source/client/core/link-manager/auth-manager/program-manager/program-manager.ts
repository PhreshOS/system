import { TransmittedProgramManager } from "@server/core/link-manager/auth-manager/program-manager/program-manager"
import { HostedEntry } from "@server/core/link-manager/auth-manager/program-manager/entry"
import { Publish, Subscribe } from "@libs/the-link/decorators/escript"
import TheLink from "@libs/the-link/the-link"
import AuthManager from "../auth-manager"
import Program from "./program"
import { type Launch, type ProgramCommandChunk, type ProgramIconSize } from "@phreshos/core"

/**
 * The peer of the core's programs: born holding them from the
 * transmitted payload, following what arrives and what is forgotten,
 * and re-emitting the derived list on its own tunnel.
 *
 * Keyed by the program's public identity. A display name addresses
 * nothing and may be shared.
 *
 * The trusted desktop may install, uninstall, or forget a Program only
 * after deriving that Program from a frame. These methods take the
 * already-resolved subject; no client-provided identity is forwarded.
 */
export default class ProgramManager extends TheLink {

    public readonly authManager: AuthManager

    public readonly programs = new Map<string, Program>()

    private readonly commands = new Map<string, PendingCommand>()

    public constructor(authManager: AuthManager, payload: TransmittedProgramManager) {

        super()

        this.authManager = authManager

        for (const [identity, entry] of payload.programs) this.programs.set(identity, new Program(this, entry))

        this.connectTo(this.authManager, "/program")
    }

    // A store's five controls, asked of the core. The desktop answers a
    // pane's store words with this, so a client half means the same
    // thing by them as a server half does — one implementation, two
    // roads to it.
    public async store(identity: string, operation: string, key: string, value?: unknown, ttl?: number) {

        return await this.$outbound.publishFirst("/store", identity, operation, key, value, ttl)
    }

    // Another instance of a program. Which program is the desktop's to
    // decide before it asks — from the frame, for a pane; from the list,
    // for its own controls.
    public async createProcess(identity: string, launch: Launch = {}, parent?: string) {

        return await this.$outbound.publishFirst("/create-process", identity, launch, parent) as string
    }

    /** Atomically resolves one named Process at the authoritative host. */
    public async findOrCreateProcess(identity: string, launch: Launch & { name: string }, parent?: string) {

        return await this.$outbound.publishFirst("/find-or-create-process", identity, launch, parent) as string
    }

    public async install(identity: string, asker: string) {

        return await this.$outbound.publishFirst("/install-program", identity, asker)
    }

    /** Streams one authoritative uninstall operation to its requesting View. */
    public uninstallStreaming(identity: string, everything: boolean, asker: string) {
        const manager = this

        return (async function* (): AsyncGenerator<ProgramCommandChunk, void, void> {
            const stream = crypto.randomUUID()
            const state: PendingCommand = { queue: [], settled: false, failure: null, wake: null }

            manager.commands.set(stream, state)

            const operation = manager.$outbound.publishFirst("/uninstall-program-stream", identity, everything, asker, stream).then(
                () => { state.settled = true },
                error => { state.failure = error instanceof Error ? error : new Error(String(error)) }
            ).finally(() => {
                state.wake?.()
                state.wake = null
            })

            try {
                while (!state.settled || state.queue.length) {
                    const next = state.queue.shift()

                    if (next) {
                        yield next
                        continue
                    }

                    if (state.failure) throw state.failure

                    await new Promise<void>(resolve => { state.wake = resolve })
                }

                await operation

                if (state.failure) throw state.failure
            }
            finally {
                manager.commands.delete(stream)
            }
        })()
    }

    public async forget(identity: string, asker: string) {

        return await this.$outbound.publishFirst("/forget-program", identity, asker)
    }

    // One of a Program's metadata operations, asked of the core. Byte
    // content takes the storage door instead of the serialized link.
    public async area(identity: string, area: "data" | "cache", operation: string, args: unknown[]) {

        return await this.$outbound.publishFirst("/area", identity, area, operation, args)
    }

    // What a program has said, asked of the core. Read-only there, so
    // nothing on this side has to decide what a query means.
    public async logs(identity: string, sql: string, values: unknown[]) {

        return await this.$outbound.publishFirst("/logs", identity, sql, values)
    }

    // A program's own database, asked of the core.
    public async database(identity: string, sql: string, values: unknown[]) {

        return await this.$outbound.publishFirst("/database", identity, sql, values)
    }

    /** Request one rendered icon from the authoritative server Program. */
    public async icon(identity: string, size: ProgramIconSize) {

        return await this.$outbound.publishFirst("/icon", identity, size) as number[]
    }

    /** Reads Program-specific operating knowledge from authoritative Core. */
    public async agent(identity: string) {

        return await this.$outbound.publishFirst("/agent", identity) as string | null
    }

    @Subscribe("/install")
    @Publish("/programs", "inbound")
    protected async installed(payload: HostedEntry | null) {

        return this.arrived(payload)
    }

    private arrived(payload: HostedEntry | null) {

        if (!payload) return

        this.programs.set(payload.identity, new Program(this, payload))

        return [...this.programs.values()]
    }

    @Subscribe("/create")
    @Publish("/programs", "inbound")
    protected async created(payload: HostedEntry | null) {

        return this.arrived(payload)
    }

    @Subscribe("/uninstall")
    @Publish("/programs", "inbound")
    protected async uninstalled(payload: HostedEntry | null) {

        return this.arrived(payload)
    }

    @Subscribe("/uninstall-program-output")
    protected commandOutput(stream: string, value: unknown) {
        const state = this.commands.get(stream)

        if (!state || state.failure) return

        const chunk = value as Partial<ProgramCommandChunk> | null

        if (!chunk || (chunk.stream !== "stdout" && chunk.stream !== "stderr") || typeof chunk.text !== "string") {
            state.failure = new Error("The System returned an invalid Program command output chunk")
        }
        else if (state.queue.length >= maximumCommandQueue) {
            state.failure = new Error(`Program command output exceeded its queue capacity of ${maximumCommandQueue}`)
        }
        else state.queue.push(Object.freeze({ stream: chunk.stream, text: chunk.text }))

        state.wake?.()
        state.wake = null
    }

    @Subscribe("/forget")
    @Publish("/programs", "inbound")
    protected async forgotten(identity: string | null) {

        if (!identity) return

        this.programs.delete(identity)

        return [...this.programs.values()]
    }
}

interface PendingCommand {
    queue: ProgramCommandChunk[]
    settled: boolean
    failure: Error | null
    wake: (() => void) | null
}

const maximumCommandQueue = 256
