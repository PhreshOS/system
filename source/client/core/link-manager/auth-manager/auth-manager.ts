import { AuthManagerSnapshot } from "@server/core/link-manager/auth-manager/auth-manager"
import { Intercept } from "@the-link/core/decorators"
import ProcessManager from "./process-manager/process-manager"
import ProgramManager from "./program-manager/program-manager"
import DialogManager from "./dialog-manager"
import { TheLink } from "@the-link/core"
import LinkManager from "../link-manager"
import {
    type PermissionChange,
    type PermissionName,
    type PermissionRequest
} from "@phreshos/core"
import ShellManager from "./shell-manager"

export default class AuthManager extends TheLink {

    public readonly linkManager: LinkManager

    public readonly authorization: string

    public readonly programManager: ProgramManager

    public readonly processManager: ProcessManager

    public readonly dialogManager: DialogManager

    public readonly shellManager: ShellManager

    public constructor(linkManager: LinkManager, authorization: string, payload: AuthManagerSnapshot) {

        super()

        this.linkManager = linkManager

        this.authorization = authorization

        this.connectTo(this.linkManager, "/auth")

        this.programManager = new ProgramManager(this, payload.programManager)

        this.processManager = new ProcessManager(this, payload.processManager)

        this.dialogManager = new DialogManager(this, payload.dialogManager)

        this.shellManager = new ShellManager(this)
    }

    @Intercept("outbound")
    protected authenticate(...values: unknown[]) {

        return [this.authorization, ...values]
    }

    /** Emit one authorized private fact without creating a response path. */
    public emit(event: string, ...values: unknown[]) {

        this.linkManager.emitToSession(`/auth${event}`, this.authorization, ...values)
    }

    public async storage(operation: string, values: string[]) {

        return await this.$outbound.publishFirst("/storage", operation, values)
    }

    public async uploadsPath() {

        return await this.$outbound.publishFirst("/uploads/path") as string
    }

    public async updateAppearance(value: unknown) {

        return await this.$outbound.publishFirst("/appearance/update", value)
    }

    public async permission<Name extends PermissionName>(process: string, name: Name) {

        return await this.$outbound.publishFirst("/permission/get", process, name)
    }

    public async grantsPermission<Name extends PermissionName>(process: string, name: Name, requested: PermissionRequest<Name>) {

        return await this.$outbound.publishFirst("/permission/grants", process, name, requested) as boolean
    }

    public async grantsStorage(process: string, path: string, operation?: "read" | "write" | "delete") {

        return await this.$outbound.publishFirst("/permission/storage", process, path, operation) as boolean
    }

    public async requestPermission<Name extends PermissionName>(
        process: string,
        request: string,
        name: Name,
        permission: PermissionRequest<Name>
    ): Promise<PermissionChange<Name>> {

        return await this.$outbound.publishFirst("/permission/request", request, process, name, permission) as PermissionChange<Name>
    }

    public async cancelPermission(process: string, request: string) {

        await this.$outbound.publish("/permission/cancel", request, process)
    }

    public disconnect() {

        this.disconnectFrom(this.linkManager, "/auth")
    }
}
