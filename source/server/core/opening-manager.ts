import { TheLink } from "@the-link/core"
import { Subscribe } from "@the-link/core/decorators"
import { opensType, parseOpenOptions, parseOpenTarget, parseOpenType, type OpenRequestSnapshot, type OpenTarget, type Position } from "@phreshos/core"
import shortIdentity from "@libs/short-identity"
import type AuthManager from "./link-manager/auth-manager/auth-manager"
import type ProgramManager from "./link-manager/auth-manager/program-manager/program-manager"
import type Process from "./link-manager/auth-manager/process-manager/process"
import { endpointReference } from "./link-manager/auth-manager/process-manager/endpoint-reference"

/** Where the default Program of each media type and family is kept. */
const defaultsKey = "opening-defaults"

/** How long a request waits for the owner to choose before it ends with nothing opened. */
export const openRequestTimeout = 120_000

/**
 * Opening: something to open goes to its type's default Program, else its family's (`image/*`), or
 * waits as a request until the owner chooses one, even when no Program opens it. The System only
 * records requests and choices; how a request is shown is up to the Shell.
 */
export default class OpeningManager extends TheLink {

    private readonly pendingRequests = new Map<string, PendingOpenRequest>()

    /**
     * The defaults that count, as last announced: no Program is known before the Programs register, so
     * none count yet, and each one that comes to count is announced as it does.
     */
    private counted: Readonly<Record<string, string>> = {}

    private settling: Promise<void> = Promise.resolve()

    public constructor(private readonly authManager: AuthManager) {

        super()

        this.connectTo(authManager, "/opening")
    }

    /**
     * Follows every change of the Programs the System knows: one attached, installed, updated, or
     * forgotten can make a default count or stop counting.
     */
    public followPrograms(programs: ProgramManager) {

        for (const change of ["/create", "/install", "/forget"]) programs.$outbound.subscribe(change, () => this.settle())
    }

    public requests() {

        return [...this.pendingRequests.values()].map(request => request.snapshot)
    }

    public pending(identity: string) {

        return this.pendingRequests.has(identity)
    }

    /** The Programs that open this exact type, or all of this family, by identity: installed or attached from a project. */
    public programsFor(type: string): string[] {

        return [...this.authManager.programManager.programs.values()]
            .filter(entry => opensType(entry.program.config.opens ?? [], type))
            .map(entry => entry.identity)
    }

    /**
     * Opens one target for an Endpoint, or for the owner when `from` is null. The asker hands it over:
     * it resolves once the System has taken it, and rejects only for a target or options it cannot
     * read. What follows is between the System and the owner: a default Program opens it at once;
     * otherwise it waits as a request for the owner, even with no Program to offer.
     */
    public async open(value: unknown, from: Readonly<{ process: Process, endpoint: "server" | "client" }> | null, options?: unknown) {

        const target = parseOpenTarget(value)
        // Where the asker would have the window open, unless the Program that opens it says.
        const position = parseOpenOptions(options).position ?? null
        const programs = this.programsFor(target.type)

        // The exact type's default is the stronger choice; its family's applies only without one.
        const defaults = await this.counting()
        const chosen = [defaults[target.type], defaults[`${target.type.slice(0, target.type.indexOf("/"))}/*`]].find(program => program !== undefined)

        if (chosen) {
            await this.launch(chosen, target, position)
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

        // The request is the owner's from here: it stays until they decide, whatever becomes of the asker.
        this.pendingRequests.set(identity, { snapshot, position, timer: null, resolving: false })

        await Promise.all([
            this.authManager.processManager.announceHost("opening", null, "request", "system", snapshot).catch(() => undefined),
            this.$outbound.publish("/request", snapshot).catch(() => undefined)
        ])

        const pending = this.pendingRequests.get(identity)

        // Observable before it can expire, as a permission request is.
        if (pending) pending.timer = setTimeout(() => { this.cancel(identity).catch(() => undefined) }, openRequestTimeout)
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

            await this.launch(program, request.snapshot.target, request.position)
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

    /**
     * The default Program of each media type and family, as the Programs themselves: only those that
     * count, whose Program the System knows and still opens that type.
     */
    @Subscribe("/defaults")
    public async defaults() {

        return Object.fromEntries(Object.entries(await this.counting()).map(([type, program]) => [type, this.record(program)]))
    }

    /**
     * The chosen defaults that count. One that does not stays chosen: it counts again when its Program
     * is installed again or opens that type again, unless the owner changes it or the Program is purged.
     */
    private async counting() {

        return Object.fromEntries(Object.entries(await this.chosen()).filter(([type, program]) => this.programsFor(type).includes(program)))
    }

    /** Announces each default that came to count, changed, or stopped counting since last announced. */
    private settle() {

        this.settling = this.settling.then(async () => {

            const before = this.counted
            const now = await this.counting()

            this.counted = now

            for (const type of new Set([...Object.keys(before), ...Object.keys(now)])) {
                if (before[type] !== now[type]) await this.announceDefault(type, now[type] ?? null)
            }
        }).catch(() => undefined)

        return this.settling
    }

    /** The default Program of each media type and family, by identity, as stored. */
    private async chosen(): Promise<Readonly<Record<string, string>>> {

        const stored = await this.store.get(defaultsKey) ?? {}

        if (!stored || typeof stored !== "object" || Array.isArray(stored) || Object.values(stored).some(program => typeof program !== "string")) {
            throw new Error("The stored opening defaults are invalid")
        }

        return stored as Record<string, string>
    }

    @Subscribe("/set-default")
    public async setDefault(type: unknown, program: unknown) {

        const kept = parseOpenType(type)

        if (typeof program !== "string" || !this.programsFor(kept).includes(program)) {
            throw new Error(`That Program does not open ${kept}`)
        }

        const defaults = await this.chosen()

        if (defaults[kept] === program) return

        await this.store.set(defaultsKey, { ...defaults, [kept]: program })
        await this.settle()
    }

    @Subscribe("/clear-default")
    public async clearDefault(type: unknown) {

        const cleared = parseOpenType(type)
        const { [cleared]: previous, ...kept } = await this.chosen()

        if (previous === undefined) return

        await this.store.set(defaultsKey, kept)
        await this.settle()
    }

    /**
     * Removes every default naming a Program, as purging it does: nothing in the System is to say it
     * was ever there. Each type it opened by default is then decided again, as one never chosen.
     */
    public async forgetProgram(program: string) {

        const defaults = await this.chosen()

        if (!Object.values(defaults).includes(program)) return

        await this.store.set(defaultsKey, Object.fromEntries(Object.entries(defaults).filter(([, chosen]) => chosen !== program)))
        await this.settle()
    }

    private async announceDefault(type: string, program: string | null) {

        const record = program === null ? null : this.record(program)

        await Promise.all([
            this.authManager.processManager.announceHost("opening", null, "changeDefault", "system", type, record).catch(() => undefined),
            this.$outbound.publish("/default-change", type, record).catch(() => undefined)
        ])
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

    private async launch(program: string, target: OpenTarget, position: Position | null) {

        const entry = this.authManager.programManager.programs.get(program)

        if (!entry) throw new Error("The System does not know that Program")

        await this.authManager.programManager.open(entry.program, target, position)
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

        await Promise.all([
            this.authManager.processManager.announceHost("opening", null, "resolve", "system", request.snapshot, chosen).catch(() => undefined),
            this.$outbound.publish("/resolve", request.snapshot, chosen).catch(() => undefined)
        ])

    }

    public toJSON() {

        return { requests: new Map(this.requests().map(request => [request.identity, request])) }
    }
}

interface PendingOpenRequest {
    readonly snapshot: OpenRequestSnapshot
    /** Where the asker would have the window open, unless its Program says. */
    readonly position: Position | null
    timer: ReturnType<typeof setTimeout> | null
    resolving: boolean
}

export type OpeningManagerSnapshot = ReturnType<OpeningManager["toJSON"]>
