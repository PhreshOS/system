import { TransmittedProgramManager } from "@server/core/link-manager/auth-manager/program-manager/program-manager"
import { HostedEntry } from "@server/core/link-manager/auth-manager/program-manager/entry"
import { Publish, Subscribe } from "@the-link/core/decorators"
import { TheLink } from "@the-link/core"
import AuthManager from "../auth-manager"
import Program from "./program"
import { type Launch, type PermissionInput, type ProgramCommandChunk, type ProgramIconSize } from "@phreshos/core"

/**
 * The peer of the core's programs: born holding them from the
 * transmitted payload, following what arrives and what is forgotten,
 * and re-emitting the derived list on its own tunnel.
 *
 * Keyed by the program's public identity. A display name addresses
 * nothing and may be shared.
 *
 * Operations forward exact handles rather than reusable identities. Core
 * validates the handle again, so a retained Program can never retarget a
 * replacement that later claims the same public identity.
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
    public async store(subject: unknown, operation: string, key: string, value?: unknown, ttl?: number) {

        return await this.$outbound.publishFirst("/store", subject, operation, key, value, ttl)
    }

    // Another instance of the exact Program represented by the supplied
    // handle.
    public async createProcess(subject: unknown, launch: Launch = {}, parent?: string) {

        return await this.$outbound.publishFirst("/create-process", subject, launch, parent) as string
    }

    public async create(source: unknown) {

        return await this.$outbound.publishFirst("/create-program", source) as string
    }

    public async forceCreate(source: unknown, asker: string) {

        return await this.$outbound.publishFirst("/force-create-program", source, asker) as string
    }

    public async fork(subject: unknown, identity: string) {

        return await this.$outbound.publishFirst("/fork-program", subject, identity) as string
    }

    public async startup(subject: unknown, operation: string, value?: unknown) {

        return await this.$outbound.publishFirst("/startup", subject, operation, value)
    }

    public async permissions(subject: unknown, operation: "all" | "get" | "set" | "delete", name?: string, value?: Exclude<PermissionInput, null>) {

        return await this.$outbound.publishFirst("/permissions", subject, operation, name, value)
    }

    /** Atomically resolves one named Process at the authoritative host. */
    public async findOrCreateProcess(subject: unknown, launch: Launch & { name: string }, parent?: string) {

        return await this.$outbound.publishFirst("/find-or-create-process", subject, launch, parent) as string
    }

    /** Streams one authoritative Program command to its requesting View. */
    public command(subject: unknown, operation: "install" | "uninstall" | "run", value: unknown, asker: string) {
        const manager = this

        return (async function* (): AsyncGenerator<ProgramCommandChunk, void, void> {
            const stream = crypto.randomUUID()
            const state: PendingCommand = { queue: [], settled: false, failure: null, wake: null }

            manager.commands.set(stream, state)

            const pending = manager.$outbound.publishFirst("/client-command", stream, operation, subject, value, asker).then(
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

                await pending

                if (state.failure) throw state.failure
            }
            finally {
                manager.commands.delete(stream)
                manager.$outbound.publish("/client-command-cancel", stream).catch(() => undefined)
            }
        })()
    }

    public async forget(subject: unknown, asker: string) {

        return await this.$outbound.publishFirst("/forget-program", subject, asker)
    }

    // One of a Program's metadata operations, asked of the core. Byte
    // content takes the storage door instead of the serialized link.
    public async area(subject: unknown, area: "data" | "cache", operation: string, args: unknown[]) {

        return await this.$outbound.publishFirst("/area", subject, area, operation, args)
    }

    // What a program has said, asked of the core. Read-only there, so
    // nothing on this side has to decide what a query means.
    public async logs(subject: unknown, sql: string, values: unknown[]) {

        return await this.$outbound.publishFirst("/logs", subject, sql, values)
    }

    // A program's own database, asked of the core.
    public async database(subject: unknown, sql: string, values: unknown[]) {

        return await this.$outbound.publishFirst("/database", subject, sql, values)
    }

    /** Request one rendered icon from the authoritative server Program. */
    public async icon(subject: unknown, size: ProgramIconSize) {

        return await this.$outbound.publishFirst("/icon", subject, size) as number[]
    }

    /** Reads Program-specific operating knowledge from authoritative Core. */
    public async agent(subject: unknown) {

        return await this.$outbound.publishFirst("/agent", subject) as string | null
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

    @Subscribe("/client-command-output")
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

        const program = this.programs.get(identity)

        this.programs.delete(identity)

        if (program) await this.$inbound.publish("/forgotten", program)

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
