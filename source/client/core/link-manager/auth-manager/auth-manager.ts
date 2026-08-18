import { TransmittedAuthManager } from "@server/core/link-manager/auth-manager/auth-manager"
import { Intercept } from "@libs/the-link/decorators/escript"
import ProcessManager from "./process-manager/process-manager"
import ProgramManager from "./program-manager/program-manager"
import DialogManager from "./dialog-manager"
import TheLink from "@libs/the-link/the-link"
import LinkManager from "../link-manager"
import { type PermissionDecision, type PermissionName, type ThemeProperties } from "@phreshos/core"

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

    /** Replace the authoritative system Theme. */
    public async updateTheme(theme: ThemeProperties) {

        await this.$outbound.publish("/theme", theme)
    }

    /** Reads one effective permission for the structurally identified Process. */
    public async permissionGranted(process: string, permission: PermissionName): Promise<PermissionDecision> {

        return await this.$outbound.publishFirst("/permission/granted", process, permission) as PermissionDecision
    }

    /** Requests one permission until the iframe boundary cancels or authority decides. */
    public async requestPermission(process: string, permission: PermissionName, signal: AbortSignal): Promise<PermissionDecision> {

        const request = crypto.randomUUID()

        const cancel = () => { this.$outbound.publish("/permission/cancel", request, process).catch(() => undefined) }

        if (signal.aborted) return null

        signal.addEventListener("abort", cancel, { once: true })

        try { return await this.$outbound.publishFirst("/permission/request", request, process, permission) as PermissionDecision }

        finally { signal.removeEventListener("abort", cancel) }
    }

    public disconnect() {

        this.disconnectFrom(this.linkManager, "/auth")
    }
}
