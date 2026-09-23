import { Forward, Intercept, Subscribe } from "@the-link/core/decorators"
import UploadManager, { uploadLimit } from "@server/core/upload-manager"
import DialogManager from "@server/core/dialog-manager"
import ProcessManager from "./process-manager/process-manager"
import ProgramManager from "./program-manager/program-manager"
import { TheLink } from "@the-link/core"
import LinkManager from "../link-manager"
import { parsePermissionName, type PermissionRequest } from "@phreshos/core"
import ShellManager from "./shell-manager"

export default class AuthManager extends TheLink {

    private readonly storageWatches = new Map<string, AbortController>()

    public readonly linkManager: LinkManager

    public readonly programManager: ProgramManager

    public readonly processManager: ProcessManager

    public readonly dialogManager: DialogManager

    public readonly shellManager: ShellManager

    public constructor(linkManager: LinkManager) {

        super()

        this.linkManager = linkManager

        this.programManager = new ProgramManager(this)

        this.processManager = new ProcessManager(this)

        this.dialogManager = this.linkManager.application.dialogManager

        this.shellManager = new ShellManager(this)

        this.dialogManager.connectTo(this, "/dialog")

        this.subscribeTo(this.linkManager, "/auth")
    }

    private get uploads(): UploadManager {

        return this.linkManager.application.uploads
    }

    // What being authorized means, decided once. Every road in asks
    // here: the link before it carries a message, and the uploads door
    // before it accepts bytes.
    public verify(sessionToken: unknown) {

        const session = typeof sessionToken === "string" ? this.linkManager.resolveSessionToken(sessionToken) : null

        if (!session) throw new Error("Unauthorized")
    }

    /** Identity of the connection currently invoking an authenticated operation. */
    public connection() {

        return this.linkManager.connection().identity
    }

    /** Lifetime of the connection currently invoking an authenticated operation. */
    public connectionSignal() {

        return this.linkManager.connection().signal
    }

    @Intercept("inbound")
    protected authenticate(...values: unknown[]) {

        if (this.linkManager.connection().external) return values

        const [sessionToken, ...authenticated] = values

        this.verify(sessionToken)

        return authenticated
    }

    // Writing a public value is authorized here; the uploads door is only the
    // Client transport that brings its bytes to this operation.
    public async upload(sessionToken: unknown, content: ReadableStream<Uint8Array> | null, extension: string, signal?: AbortSignal) {

        this.verify(sessionToken)

        const file = await this.uploads.write(extension, content, signal)

        return { file, ...this.uploads.stat(file)! }
    }

    /** Perform a server-side request after the desktop door proves authorization. */
    public fetch(sessionToken: unknown, input: string | URL | Request, init?: RequestInit) {

        this.verify(sessionToken)

        return fetch(input, init)
    }

    public streamArea(sessionToken: unknown, program: unknown, area: "data" | "cache", path: string[], options: [offset?: number, length?: number] = []) {

        this.verify(sessionToken)

        return this.programManager.streamArea(program, area, path, options)
    }

    @Subscribe("/storage")
    protected async storage(operation: unknown, values: unknown, input?: unknown) {

        if (typeof operation !== "string" || !Array.isArray(values) || values.some(value => typeof value !== "string")) throw new Error("A System storage operation is invalid")

        const area = this.linkManager.application.home

        if (operation === "path") return area.resolve(values)
        if (operation === "name") return area.name(values)
        if (operation === "create") return area.create(values)

        if (operation === "stat-storage" || operation === "stat-file") {

            const found = area.stat(values)

            if (!found) return null

            if (operation === "stat-storage") {

                if (found.kind !== "directory") throw new Error(`${area.resolve(values)} is not a Storage directory`)

                return { modifiedAt: found.modifiedAt }
            }

            if (found.kind !== "file") throw new Error(`${area.resolve(values)} is not a file`)

            return { size: found.size, modifiedAt: found.modifiedAt }
        }

        if (operation === "list") {

            const options = storageListOptions(input)

            return area.list(values, [options.recursive, options.depth])
        }

        if (operation === "delete-storage" || operation === "delete-file") {

            const found = area.stat(values)

            if (found && operation === "delete-storage" && found.kind !== "directory") throw new Error(`${area.resolve(values)} is not a Storage directory`)

            if (found && operation === "delete-file" && found.kind !== "file") throw new Error(`${area.resolve(values)} is not a file`)

            return area.delete(values)
        }

        if (operation === "clear") return area.clear(values)
        if (operation === "space") return area.space(values)

        throw new Error(`System storage does not know "${operation}"`)
    }

    @Subscribe("/storage-watch")
    protected async watchStorage(stream: unknown, target: unknown) {

        if (typeof stream !== "string" || !stream) throw new Error("A Storage watch needs an identity")

        const request = storageWatchTarget(target)

        const connection = this.connection()

        const key = `${connection}:${stream}`

        if (this.storageWatches.has(key)) throw new Error("A Storage watch identity must be unique")

        const controller = new AbortController()

        const signal = AbortSignal.any([controller.signal, this.connectionSignal()])

        this.storageWatches.set(key, controller)

        try {

            const operation = request.scope === "system"
                ? this.linkManager.application.home.watch(request.path, request.recursive, signal)
                : this.programManager.watchArea(request.program, request.area, request.path, request.recursive, signal)

            for await (const change of operation) await this.publishToBoundary(connection, "/storage-change", stream, change)
        }

        finally {

            this.storageWatches.delete(key)
        }
    }

    @Subscribe("/storage-watch-cancel")
    protected cancelStorageWatch(stream: unknown) {

        if (typeof stream !== "string") return

        this.storageWatches.get(`${this.connection()}:${stream}`)?.abort()
    }

    @Subscribe("/uploads/path")
    protected async uploadsPath() {

        return this.uploads.fileManager.path
    }

    @Subscribe("/uploads/access")
    protected async uploadsAccess() {

        return { path: this.uploads.fileManager.path, limit: uploadLimit }
    }

    @Subscribe("/uploads/stat")
    protected async uploadStat(file: unknown) {

        return this.uploads.stat(String(file))
    }

    @Subscribe("/appearance/update")
    protected async changeAppearance(value: unknown) {

        return await this.updateAppearance(value)
    }

    @Subscribe("/session/sign-out-current")
    protected async signOutCurrentSession() {

        const session = this.linkManager.connection().session

        if (!session) throw new Error("The Connection has no Session")

        await this.linkManager.signOutSession(session)
    }

    @Subscribe("/authentication/state")
    protected authenticationState() {

        return this.linkManager.application.system.authenticationState()
    }

    @Subscribe("/authentication/requirements")
    protected authenticationRequirements() {

        return this.linkManager.application.system.authenticationRequirements()
    }

    @Subscribe("/authentication/set-credentials")
    protected async setAuthenticationCredentials(credentials: unknown) {

        await this.linkManager.application.system.setAuthenticationCredentials(credentials)
    }

    @Subscribe("/authentication/sign-out-all-sessions")
    protected async signOutAllSessions() {

        await this.linkManager.application.system.signOutAllSessions()
    }

    @Subscribe("/authentication/connections")
    protected async connections() {

        return this.linkManager.application.system.listConnections()

            .map(connection => this.linkManager.connectionSnapshot(connection))
    }

    @Subscribe("/connection/current")
    protected async currentConnection() {

        return this.linkManager.connectionSnapshot(this.linkManager.connection())
    }

    @Subscribe("/authentication/connection")
    protected async connectionFind(identity: unknown) {

        const connection = this.linkManager.application.system.findConnection(domainIdentity(identity, "Connection"))

        return connection ? this.linkManager.connectionSnapshot(connection) : null
    }

    @Subscribe("/connection/state")
    protected async connectionState(identity: unknown) {

        return this.linkManager.application.system.connectionSnapshot(domainIdentity(identity, "Connection"))
    }

    @Subscribe("/connection/session")
    protected async connectionSession(identity: unknown) {

        return this.linkManager.application.system.connectionSession(domainIdentity(identity, "Connection"))
    }

    @Subscribe("/connection/sign-in")
    protected async connectionSignIn(identity: unknown) {

        return this.linkManager.application.system.signInConnection(domainIdentity(identity, "Connection"))
    }

    @Subscribe("/authentication/sessions")
    protected async sessions() {

        return this.linkManager.application.system.listSessions()

            .map(identity => this.linkManager.sessionSnapshot(identity))
    }

    @Subscribe("/authentication/session")
    protected async sessionFind(identity: unknown) {

        const session = this.linkManager.application.system.findSession(domainIdentity(identity, "Session"))

        return session ? this.linkManager.sessionSnapshot(session) : null
    }

    @Subscribe("/session/state")
    protected async sessionState(identity: unknown) {

        return this.linkManager.application.system.sessionSnapshot(domainIdentity(identity, "Session"))
    }

    @Subscribe("/session/connections")
    protected async sessionConnections(identity: unknown) {

        return this.linkManager.application.system.sessionConnections(domainIdentity(identity, "Session"))

            .map(connection => this.linkManager.connectionSnapshot(connection))
    }

    @Subscribe("/session/sign-out")
    protected async sessionSignOut(identity: unknown) {

        return this.linkManager.application.system.signOutSession(domainIdentity(identity, "Session"))
    }

    /** Apply a partial System Appearance update through the authenticated boundary. */
    public async updateAppearance(value: unknown) {

        return await this.linkManager.updateAppearance(value)
    }

    @Subscribe("/permission/storage")
    protected async grantsStorage(process: unknown, path: unknown, operation: unknown) {

        if (typeof process !== "string"
            || typeof path !== "string"
            || operation !== undefined && operation !== "read" && operation !== "write" && operation !== "delete") {
            throw new Error("A Storage permission check is invalid")
        }

        return this.processManager.grantsStorage(process, path, operation)
    }

    @Subscribe("/permission/request")
    protected async requestPermission(request: unknown, process: unknown, program: unknown, name: unknown, permission: unknown) {

        if (typeof request !== "string" || typeof process !== "string") throw new Error("A permission request is invalid")

        const permissionName = parsePermissionName(name)

        return this.processManager.requestPermission(process, program, request, permissionName, permission as PermissionRequest<typeof permissionName>)
    }

    @Subscribe("/permission/cancel")
    protected async cancelPermission(request: unknown, process: unknown) {

        if (typeof request === "string" && typeof process === "string") await this.processManager.cancelPermission(process, request)
    }

    public async writeArea(sessionToken: unknown, program: unknown, area: "data" | "cache", path: string[], content: ReadableStream<Uint8Array> | null, signal?: AbortSignal, overwrite = true) {

        this.verify(sessionToken)

        await this.programManager.writeArea(program, area, path, content, signal, overwrite)
    }

    public async appendArea(sessionToken: unknown, program: unknown, area: "data" | "cache", path: string[], content: ReadableStream<Uint8Array> | null, signal?: AbortSignal) {

        this.verify(sessionToken)

        await this.programManager.appendArea(program, area, path, content, signal)
    }

    // Targeted observations also belong to trusted external boundaries, which
    // are intentionally absent from the public Desktop Connection registry.
    public async publishToBoundary(connectionIdentity: string, event: string, ...values: unknown[]) {

        const connection = this.linkManager.boundaries.get(connectionIdentity)
        if (!connection || !connection.external && !connection.session) return

        await connection.link.$outbound.publish(`/auth${event}`, ...values)
    }

    @Forward("outbound", undefined, "/auth")
    protected async broadcastToAuthorizedBoundaries(event: string, ...values: unknown[]) {

        for (const connection of this.linkManager.boundaries.values()) {

            if (!connection.external && !connection.session) continue

            await connection.link.$outbound.publish(event, ...values)
        }
    }

    public toJSON() {

        return {

            username: this.linkManager.application.authentication.username,

            programManager: this.programManager,

            processManager: this.processManager,

            dialogManager: this.dialogManager
        }
    }
}

function storageListOptions(value: unknown) {

    if (value === undefined) return { recursive: false, depth: undefined }

    if (!value || typeof value !== "object") throw new Error("Storage list options must be an object")

    const options = value as { recursive?: unknown, depth?: unknown }

    if (options.recursive !== undefined && typeof options.recursive !== "boolean") throw new Error("Storage recursive must be boolean")

    if (options.depth !== undefined && (!Number.isSafeInteger(options.depth) || (options.depth as number) < 0)) throw new Error("Storage depth must be a non-negative safe integer")

    if (options.depth !== undefined && options.recursive !== true) throw new Error("A Storage list depth requires recursive listing")

    return { recursive: options.recursive === true, depth: options.depth as number | undefined }
}

function domainIdentity(value: unknown, domain: "Connection" | "Session") {

    if (typeof value !== "string") throw new Error(`A ${domain} identity is required`)

    return value
}

function storageWatchTarget(value: unknown) {

    if (!value || typeof value !== "object") throw new Error("A Storage watch target is required")

    const target = value as { scope?: unknown, path?: unknown, recursive?: unknown, program?: unknown, area?: unknown }

    if ((target.scope !== "system" && target.scope !== "program") || !Array.isArray(target.path) || target.path.some(part => typeof part !== "string") || typeof target.recursive !== "boolean") {

        throw new Error("A Storage watch target is invalid")
    }

    if (target.scope === "system") return { scope: "system" as const, path: target.path as string[], recursive: target.recursive }

    if ((target.area !== "data" && target.area !== "cache") || !target.program || typeof target.program !== "object") throw new Error("A Program Storage watch target is invalid")

    return { scope: "program" as const, program: target.program, area: target.area as "data" | "cache", path: target.path as string[], recursive: target.recursive }
}

export interface AuthManagerSnapshot {

    username: string | null

    programManager: ReturnType<ProgramManager["toJSON"]>

    processManager: import("./process-manager/process-manager").ProcessManagerSnapshot

    dialogManager: ReturnType<DialogManager["toJSON"]>
}
