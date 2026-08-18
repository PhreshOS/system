import { Connect, Forward, Intercept, Subscribe } from "@libs/the-link/decorators/escript"
import ServedFileManager from "@server/core/served-file-manager"
import DialogManager from "@server/core/dialog-manager"
import ProcessManager from "./process-manager/process-manager"
import ProgramManager from "./program-manager/program-manager"
import { Transmitted } from "@libs/superjson"
import TheLink from "@libs/the-link/the-link"
import LinkManager from "../link-manager"
import { isPermissionName } from "@phreshos/core"

export default class AuthManager extends TheLink {

    public readonly linkManager: LinkManager

    public readonly programManager: ProgramManager

    public readonly processManager: ProcessManager

    public readonly dialogManager: DialogManager

    public constructor(linkManager: LinkManager) {

        super()

        this.linkManager = linkManager

        this.programManager = new ProgramManager(this)

        this.processManager = new ProcessManager(this)

        this.dialogManager = this.linkManager.application.dialogManager

        this.dialogManager.connectTo(this, "/dialog")

        this.subscribeTo(this.linkManager, "/auth")
    }

    private get servedFiles(): ServedFileManager {

        return this.linkManager.application.servedFiles
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

    // Making a value public is authorized here; the uploads door is only the
    // client transport that brings its bytes to this operation.
    public async serve(authorization: unknown, content: ReadableStream<Uint8Array> | null, type: string | null, extension: string, signal?: AbortSignal) {

        this.verify(authorization)

        const file = await this.servedFiles.write(extension, content, signal)

        return { ...this.servedFiles.describe(file), type }
    }

    /** Perform a server-side request after the desktop door proves authorization. */
    public fetch(authorization: unknown, input: string | URL | Request, init?: RequestInit) {

        this.verify(authorization)

        return fetch(input, init)
    }

    public streamArea(authorization: unknown, identity: string, area: "data" | "cache", path: string[]) {

        this.verify(authorization)

        return this.programManager.streamArea(identity, area, path)
    }

    /** Replace the system Theme through the authenticated boundary. */
    @Subscribe("/theme")
    public async updateTheme(value: unknown) {

        return await this.linkManager.updateTheme(value)
    }

    @Connect("/permission/granted")
    protected async permissionGranted(process: unknown, permission: unknown) {

        if (typeof process !== "string" || !isPermissionName(permission)) throw new Error("A permission request is invalid")

        return this.processManager.permissionGranted(process, permission)
    }

    @Connect("/permission/request")
    protected async requestPermission(request: unknown, process: unknown, permission: unknown) {

        if (typeof request !== "string" || typeof process !== "string" || !isPermissionName(permission)) throw new Error("A permission request is invalid")

        return await this.processManager.requestPermission(process, request, permission)
    }

    @Subscribe("/permission/cancel")
    protected async cancelPermission(request: unknown, process: unknown) {

        if (typeof request !== "string" || typeof process !== "string") return

        await this.processManager.cancelPermission(process, request)
    }

    public async writeArea(authorization: unknown, identity: string, area: "data" | "cache", path: string[], content: ReadableStream<Uint8Array> | null, signal?: AbortSignal) {

        this.verify(authorization)

        await this.programManager.writeArea(identity, area, path, content, signal)
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

export interface ServedFile {

    file: string

    type: string | null

    size: number

    time: number
}
