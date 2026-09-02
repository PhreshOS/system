import { TransmittedAuthManager } from "@server/core/link-manager/auth-manager/auth-manager"
import { Intercept } from "@the-link/core/decorators"
import ProcessManager from "./process-manager/process-manager"
import ProgramManager from "./program-manager/program-manager"
import DialogManager from "./dialog-manager"
import { TheLink } from "@the-link/core"
import LinkManager from "../link-manager"
import { type PermissionChange, type PermissionRequest } from "@phreshos/core"

export default class AuthManager extends TheLink {

    public readonly linkManager: LinkManager

    public readonly authorization: string

    public readonly programManager: ProgramManager

    public readonly processManager: ProcessManager

    public readonly dialogManager: DialogManager

    public constructor(linkManager: LinkManager, authorization: string, payload: TransmittedAuthManager) {

        super()

        this.linkManager = linkManager

        this.authorization = authorization

        this.connectTo(this.linkManager, "/auth")

        this.programManager = new ProgramManager(this, payload.programManager)

        this.processManager = new ProcessManager(this, payload.processManager)

        this.dialogManager = new DialogManager(this, payload.dialogManager)
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

    public async updateAppearance(value: unknown) {

        return await this.$outbound.publishFirst("/appearance/update", value)
    }

    public async permission(process: string, name: string) {

        return await this.$outbound.publishFirst("/permission/get", process, name)
    }

    public async grantsPermission(process: string, name: string, requested: readonly string[]) {

        return await this.$outbound.publishFirst("/permission/grants", process, name, requested) as boolean
    }

    public async requestPermission(process: string, request: string, name: string, permission: PermissionRequest) {

        return await this.$outbound.publishFirst("/permission/request", request, process, name, permission) as PermissionChange
    }

    public async cancelPermission(process: string, request: string) {

        await this.$outbound.publish("/permission/cancel", request, process)
    }

    public disconnect() {

        this.disconnectFrom(this.linkManager, "/auth")
    }
}
