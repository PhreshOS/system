import { Connect, Forward, Intercept, Subscribe } from "@the-link/core/decorators"
import UploadManager from "@server/core/upload-manager"
import DialogManager from "@server/core/dialog-manager"
import ProcessManager from "./process-manager/process-manager"
import ProgramManager from "./program-manager/program-manager"
import { Transmitted } from "@libs/messagepack"
import { TheLink } from "@the-link/core"
import LinkManager from "../link-manager"
import { type PermissionRequest } from "@phreshos/core"
import ShellManager from "./shell-manager"

export default class AuthManager extends TheLink {

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
    public verify(authorization: unknown) {

        const session = typeof authorization === "string" ? this.linkManager.resolveAuthorization(authorization) : null

        if (!session) throw new Error("Unauthorized")
    }

    @Intercept("inbound")
    protected authenticate(authorization: string, ...values: unknown[]) {

        this.verify(authorization)

        return values
    }

    // Writing a public value is authorized here; the uploads door is only the
    // Client transport that brings its bytes to this operation.
    public async upload(authorization: unknown, content: ReadableStream<Uint8Array> | null, extension: string, signal?: AbortSignal) {

        this.verify(authorization)

        const file = await this.uploads.write(extension, content, signal)

        return this.uploads.stat(file)!
    }

    /** Perform a server-side request after the desktop door proves authorization. */
    public fetch(authorization: unknown, input: string | URL | Request, init?: RequestInit) {

        this.verify(authorization)

        return fetch(input, init)
    }

    public streamArea(authorization: unknown, program: unknown, area: "data" | "cache", path: string[]) {

        this.verify(authorization)

        return this.programManager.streamArea(program, area, path)
    }

    @Connect("/storage")
    protected async storage(operation: unknown, values: unknown) {

        if (typeof operation !== "string" || !Array.isArray(values) || values.some(value => typeof value !== "string")) throw new Error("A System storage operation is invalid")

        const area = this.linkManager.application.home

        if (operation === "path") return area.path
        if (operation === "resolve") return area.resolve(values)
        if (operation === "stat") return area.stat(values)
        if (operation === "list") return area.list(values)
        if (operation === "delete") return area.delete(values)
        if (operation === "clear") return area.clear(values)

        throw new Error(`System storage does not know "${operation}"`)
    }

    @Connect("/appearance/update")
    protected async changeAppearance(value: unknown) {

        return await this.updateAppearance(value)
    }

    /** Replace System Appearance through the authenticated boundary. */
    public async updateAppearance(value: unknown) {

        return await this.linkManager.updateAppearance(value)
    }

    @Connect("/permission/get")
    protected async permission(process: unknown, name: unknown) {

        if (typeof process !== "string" || typeof name !== "string") throw new Error("A permission read is invalid")

        return this.processManager.permission(process, name)
    }

    @Connect("/permission/grants")
    protected async grantsPermission(process: unknown, name: unknown, requested: unknown) {

        if (typeof process !== "string" || typeof name !== "string" || !Array.isArray(requested) || requested.some(value => typeof value !== "string")) {
            throw new Error("A permission check is invalid")
        }

        return this.processManager.grants(process, name, requested)
    }

    @Connect("/permission/request")
    protected async requestPermission(request: unknown, process: unknown, name: unknown, permission: unknown) {

        if (typeof request !== "string" || typeof process !== "string" || typeof name !== "string") throw new Error("A permission request is invalid")

        return this.processManager.requestPermission(process, request, name, permission as PermissionRequest)
    }

    @Subscribe("/permission/cancel")
    protected async cancelPermission(request: unknown, process: unknown) {

        if (typeof request === "string" && typeof process === "string") await this.processManager.cancelPermission(process, request)
    }

    public async writeArea(authorization: unknown, program: unknown, area: "data" | "cache", path: string[], content: ReadableStream<Uint8Array> | null, signal?: AbortSignal) {

        this.verify(authorization)

        await this.programManager.writeArea(program, area, path, content, signal)
    }

    // A targeted client observation belongs to one authorized desktop
    // connection. Send its copy only there; the ordinary outbound road is a
    // broadcast and would widen one frame's interest to every session.
    public async publishToConnection(connectionIdentity: string, event: string, ...values: unknown[]) {

        const connection = this.linkManager.connections.get(connectionIdentity)

        if (!connection?.session) return

        await connection.link.$outbound.publish(`/auth${event}`, ...values)
    }

    @Forward("outbound", undefined, "/auth")
    protected async broadcastToConnections(event: string, ...values: unknown[]) {

        for (const connection of this.linkManager.connections.values()) {

            if (!connection.session) continue

            await connection.link.$outbound.publish(event, ...values)
        }
    }

    public toJSON() {

        return {

            programManager: this.programManager,

            processManager: this.processManager,

            dialogManager: this.dialogManager
        }
    }
}

export type TransmittedAuthManager = Transmitted<AuthManager>
