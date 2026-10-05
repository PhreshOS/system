import { TheLink } from "@the-link/core"
import { Subscribe } from "@the-link/core/decorators"
import { opensType, parseOpenTarget, type OpenRequestSnapshot, type OpenTarget } from "@phreshos/core"
import shortIdentity from "@libs/short-identity"
import type AuthManager from "./link-manager/auth-manager/auth-manager"
import type Process from "./link-manager/auth-manager/process-manager/process"
import { endpointReference } from "./link-manager/auth-manager/process-manager/endpoint-reference"

/** Where the default Program of each media type is kept. */
const defaultsKey = "opening-defaults"

/** How long a request waits for the owner to choose before it ends with nothing opened. */
export const openRequestTimeout = 120_000

/**
 * Opening: something to open goes to its type's default Program, or waits as a request until the
 * owner chooses one. The System only records requests and choices; how a request is shown is up to the
 * Shell.
 */
export default class OpeningManager extends TheLink {

    private readonly pendingRequests = new Map<string, PendingOpenRequest>()

    public constructor(private readonly authManager: AuthManager) {

        super()

        this.connectTo(authManager, "/opening")
    }

    public requests() {

        return [...this.pendingRequests.values()].map(request => request.snapshot)
    }

    public pending(identity: string) {

        return this.pendingRequests.has(identity)
    }

    /** The installed Programs that open this exact type, by identity. */
    public programsFor(type: string): string[] {

        return [...this.authManager.programManager.programs.values()]
            .filter(entry => entry.installed && opensType(entry.program.config.opens ?? [], type))
            .map(entry => entry.identity)
    }

    /**
     * Opens one target for an Endpoint, or for the owner when `from` is null. It resolves once a
     * Process is started for it, and rejects when no Program opens it or nothing is chosen. A request
     * from outside ends with the connection that asked, through `signal`.
     */
    public async open(value: unknown, from: Readonly<{ process: Process, endpoint: "server" | "client" }> | null, signal?: AbortSignal) {

        const target = parseOpenTarget(value)
        const programs = this.programsFor(target.type)

        if (!programs.length) throw new Error(`No Program opens ${target.type}`)

        const chosen = (await this.chosen())[target.type]

        if (chosen && programs.includes(chosen)) {
            await this.launch(chosen, target)
            return
        }

        const identity = shortIdentity()
        const snapshot = Object.freeze({
            identity,
            from: from ? endpointReference(from.process, from.endpoint) : null,
            createdAt: new Date(),
            target,
            programs: Object.freeze(programs.map(program => this.record(program)))
        }) satisfies OpenRequestSnapshot

        let settle: (program: string | null) => void = () => undefined
        const result = new Promise<string | null>(resolve => { settle = resolve })
        // A request belongs to the Endpoint run that asked: when it stops, nobody waits for the answer.
        const end = () => { this.cancel(identity).catch(() => undefined) }
        const cancelEndpoint = from ? from.endpoint === "server" ? from.process.onServerStop(end) : from.process.onClientStop(end)
            : signal ? (signal.addEventListener("abort", end), () => signal.removeEventListener("abort", end)) : () => undefined

        this.pendingRequests.set(identity, { snapshot, settle, cancelEndpoint, timer: null, resolving: false })

        await Promise.all([
            this.authManager.processManager.announceHost("opening", null, "request", "system", snapshot).catch(() => undefined),
            this.$outbound.publish("/request", snapshot).catch(() => undefined)
        ])

        const pending = this.pendingRequests.get(identity)

        // Observable before it can expire, as a permission request is.
        if (pending) pending.timer = setTimeout(() => { this.cancel(identity).catch(() => undefined) }, openRequestTimeout)

        if (await result === null) throw new Error(`Nothing was chosen to open ${target.type}`)
    }

    @Subscribe("/requests")
    protected listRequests() {

        return this.requests()
    }

    @Subscribe("/pending")
    protected requestPending(identity: unknown) {

        return typeof identity === "string" && this.pending(identity)
    }

    /** Opens the request's target with one of its Programs; `always` makes that Program the type's default. */
    @Subscribe("/choose")
    public async choose(identity: unknown, program: unknown, options: unknown) {

        const request = this.claim(identity)

        try {

            if (typeof program !== "string" || !request.snapshot.programs.some(entry => entry.identity === program)) {
                throw new Error("That Program does not open this")
            }

            if ((options as { always?: unknown } | undefined)?.always === true) await this.setDefault(request.snapshot.target.type, program)

            await this.launch(program, request.snapshot.target)
            await this.finish(request, program)
        }
        catch (error) {
            if (this.pendingRequests.get(request.snapshot.identity) === request) request.resolving = false
            throw error
        }
    }

    @Subscribe("/cancel")
    public async cancel(identity: unknown) {

        const request = this.claim(identity)

        try { await this.finish(request, null) }
        catch (error) {
            if (this.pendingRequests.get(request.snapshot.identity) === request) request.resolving = false
            throw error
        }
    }

    /** The default Program of each media type, as the Programs themselves; one no longer known is left out. */
    @Subscribe("/defaults")
    public async defaults() {

        return Object.fromEntries(Object.entries(await this.chosen())
            .filter(([, program]) => this.authManager.programManager.programs.has(program))
            .map(([type, program]) => [type, this.record(program)]))
    }

    /** The default Program of each media type, by identity, as stored. */
    private async chosen(): Promise<Readonly<Record<string, string>>> {

        const stored = await this.store.get(defaultsKey) ?? {}

        if (!stored || typeof stored !== "object" || Array.isArray(stored) || Object.values(stored).some(program => typeof program !== "string")) {
            throw new Error("The stored opening defaults are invalid")
        }

        return stored as Record<string, string>
    }

    @Subscribe("/set-default")
    public async setDefault(type: unknown, program: unknown) {

        const target = parseOpenTarget({ type, uri: "about:blank" })

        if (typeof program !== "string" || !this.programsFor(target.type).includes(program)) {
            throw new Error(`That Program does not open ${target.type}`)
        }

        await this.store.set(defaultsKey, { ...await this.chosen(), [target.type]: program })
    }

    @Subscribe("/clear-default")
    public async clearDefault(type: unknown) {

        const target = parseOpenTarget({ type, uri: "about:blank" })
        const { [target.type]: _cleared, ...kept } = await this.chosen()

        await this.store.set(defaultsKey, kept)
    }

    /** What every Endpoint may know of a Program it is offered: its public record. */
    private record(program: string) {

        const entry = this.authManager.programManager.programs.get(program)

        if (!entry) throw new Error("That Program is not known")

        return entry.program.record()
    }

    private get store() {

        return this.authManager.linkManager.application.store
    }

    private async launch(program: string, target: OpenTarget) {

        const entry = this.authManager.programManager.programs.get(program)

        if (!entry?.installed) throw new Error("That Program is not installed")

        await this.authManager.programManager.open(entry.program, target)
    }

    private claim(identity: unknown) {

        const request = typeof identity === "string" ? this.pendingRequests.get(identity) : undefined

        if (!request || request.resolving) throw new Error("The open request does not exist")

        // Claimed at once, so two choices can never both open the same request.
        request.resolving = true

        return request
    }

    private async finish(request: PendingOpenRequest, program: string | null) {

        const chosen = program === null ? null : this.record(program)

        if (!this.pendingRequests.delete(request.snapshot.identity)) throw new Error("The open request does not exist")

        if (request.timer) clearTimeout(request.timer)
        request.cancelEndpoint()

        await Promise.all([
            this.authManager.processManager.announceHost("opening", null, "resolve", "system", request.snapshot, chosen).catch(() => undefined),
            this.$outbound.publish("/resolve", request.snapshot, chosen).catch(() => undefined)
        ])

        request.settle(program)
    }

    public toJSON() {

        return { requests: new Map(this.requests().map(request => [request.identity, request])) }
    }
}

interface PendingOpenRequest {
    readonly snapshot: OpenRequestSnapshot
    readonly settle: (program: string | null) => void
    readonly cancelEndpoint: () => void
    timer: ReturnType<typeof setTimeout> | null
    resolving: boolean
}

export type OpeningManagerSnapshot = ReturnType<OpeningManager["toJSON"]>
