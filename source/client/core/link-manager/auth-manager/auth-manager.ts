import { AuthManagerSnapshot } from "@server/core/link-manager/auth-manager/auth-manager"
import { Intercept, Subscribe } from "@the-link/core/decorators"
import ProcessManager from "./process-manager/process-manager"
import ProgramManager from "./program-manager/program-manager"
import DialogManager from "./dialog-manager"
import { TheLink } from "@the-link/core"
import LinkManager from "../link-manager"
import {
    type Permission,
    type PermissionName,
    type PermissionRequest
} from "@phreshos/core"
import ShellManager from "./shell-manager"
import StreamRelay from "@client/core/link-manager/stream-relay"
import { type StorageChange } from "@phreshos/core"

export default class AuthManager extends TheLink {

    public readonly linkManager: LinkManager

    public readonly sessionToken: string

    public readonly username: string | null

    public readonly programManager: ProgramManager

    public readonly processManager: ProcessManager

    public readonly dialogManager: DialogManager

    public readonly shellManager: ShellManager

    private readonly storageChanges = new StreamRelay("Storage changes", storageChange)

    public constructor(linkManager: LinkManager, sessionToken: string, payload: AuthManagerSnapshot) {

        super()

        this.linkManager = linkManager

        this.sessionToken = sessionToken

        this.username = payload.username

        this.connectTo(this.linkManager, "/auth")

        this.programManager = new ProgramManager(this, payload.programManager)

        this.processManager = new ProcessManager(this, payload.processManager)

        this.dialogManager = new DialogManager(this, payload.dialogManager)

        this.shellManager = new ShellManager(this)
    }

    @Intercept("outbound")
    protected authenticate(...values: unknown[]) {

        return [this.sessionToken, ...values]
    }

    /** Explicitly ends the Session authorizing this Desktop connection. */
    public async signOut() {

        await this.$outbound.publishFirst("/session/sign-out-current")
    }

    public connection(operation: "current" | "list" | "find" | "state" | "session" | "sign-in", identity?: string) {

        return this.$outbound.publishFirst(`/connection/${operation}`, ...(identity === undefined ? [] : [identity]))
    }

    public session(operation: "list" | "find" | "state" | "connections" | "sign-out", identity?: string) {

        return this.$outbound.publishFirst(`/session/${operation}`, ...(identity === undefined ? [] : [identity]))
    }

    /** Emit one authorized private fact without creating a response path. */
    public emit(event: string, ...values: unknown[]) {

        this.linkManager.emitToSession(`/auth${event}`, this.sessionToken, ...values)
    }

    public async storage(operation: string, path: string[], input?: unknown) {

        return await this.$outbound.publishFirst("/storage", operation, path, input)
    }

    public watchStorage(target: StorageWatchTarget) {

        return this.storageChanges.open(

            stream => this.$outbound.publishFirst("/storage-watch", stream, target),

            stream => this.$outbound.publish("/storage-watch-cancel", stream)
        )
    }

    @Subscribe("/storage-change")
    protected storageChange(stream: string, value: unknown) {

        this.storageChanges.receive(stream, value)
    }

    public async uploadsPath() {

        return await this.$outbound.publishFirst("/uploads/path") as string
    }

    public async updateAppearance(value: unknown) {

        return await this.$outbound.publishFirst("/appearance/update", value)
    }

    public async grantsStorage(process: string, path: string, operation?: "read" | "write" | "delete") {

        return await this.$outbound.publishFirst("/permission/storage", process, path, operation) as boolean
    }

    public async requestPermission<Name extends PermissionName>(
        process: string,
        program: unknown,
        request: string,
        name: Name,
        permission: PermissionRequest<Name>
    ): Promise<Permission<Name>> {

        return await this.$outbound.publishFirst("/permission/request", request, process, program, name, permission) as Permission<Name>
    }

    public async cancelPermission(process: string, request: string) {

        await this.$outbound.publish("/permission/cancel", request, process)
    }

    public disconnect() {

        this.disconnectFrom(this.linkManager, "/auth")
    }
}

export type StorageWatchTarget =
    | Readonly<{ scope: "system", path: string[], recursive: boolean }>
    | Readonly<{ scope: "program", program: { identity: string, reference: string }, area: "data" | "cache", path: string[], recursive: boolean }>

function storageChange(value: unknown): StorageChange {

    const change = value as Partial<StorageChange> | null

    if (!change || (change.event !== "change" && change.event !== "rename") || change.path !== null && typeof change.path !== "string") {

        throw new Error("The System returned an invalid Storage change")
    }

    return Object.freeze({ event: change.event, path: change.path })
}
