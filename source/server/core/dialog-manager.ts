import { Subscribe } from "@the-link/core/decorators"
import { TheLink } from "@the-link/core"
import { randomUUID } from "node:crypto"
import { type default as Process } from "./link-manager/auth-manager/process-manager/process"
import { permissionCatalog } from "./permissions"
import type { PermissionName, PermissionValue } from "@phreshos/core"

/** Authoritative runtime queue of system messages awaiting acknowledgment. */
export default class DialogManager extends TheLink {

    public readonly dialogs = new Map<string, SystemDialog>()

    private readonly permissionRequests = new Map<string, PendingPermission>()

    private readonly permissionProcesses = new Map<string, string>()

    public list() {

        return [...this.dialogs.values()]
    }

    /** Records one unexpected Server ending independently of its dead handle. */
    public async serverCrashed(process: Process, code: number | null, signal: NodeJS.Signals | null) {

        const dialog: ServerCrashDialog = {

            identity: randomUUID(),

            kind: "serverCrash",

            createdAt: new Date(),

            program: {

                identity: process.program.identity,

                name: process.program.name
            },

            process: {

                identity: process.identity,

                name: process.name
            },

            code,

            signal
        }

        this.dialogs.set(dialog.identity, dialog)

        // Authority already retains the record. A lost desktop is born with
        // the queue when it returns; notification failure must not interrupt
        // the Process teardown that produced this dialog.
        await this.$outbound.publish("/created", dialog).catch(() => undefined)
    }

    /** Waits for one authoritative owner decision for a Client Process. */
    public async requestPermission<Name extends PermissionName>(
        process: Process,
        request: string,
        permission: Name,
        values: readonly PermissionValue<Name>[]
    ): Promise<PermissionChoice> {

        if (!request || this.permissionRequests.has(request)) throw new Error("A permission request needs a unique identity")
        if (this.permissionProcesses.has(process.reference)) throw new Error("This Client Process already has a pending permission request")

        const definition = permissionCatalog.definition(permission)
        const dialog: PermissionDialog = {

            identity: randomUUID(),
            kind: "permission",
            createdAt: new Date(),
            permission,
            values: [...values],
            title: definition.title,
            description: definition.description,
            program: { identity: process.program.identity, name: process.program.name },
            process: { identity: process.identity, name: process.name }
        }

        let settle: (choice: PermissionChoice) => void = () => undefined
        const answer = new Promise<PermissionChoice>(resolve => { settle = resolve })
        const stopExit = process.onExit(() => { this.cancelPermission(request, process.reference).catch(() => undefined) })

        this.permissionRequests.set(request, { request, dialog, process: process.reference, settle, stopExit })
        this.permissionProcesses.set(process.reference, request)
        this.dialogs.set(dialog.identity, dialog)

        await this.$outbound.publish("/created", dialog).catch(() => undefined)

        return await answer
    }

    /** Resolves one permission prompt from any synchronized Desktop. */
    @Subscribe("/resolve-permission")
    protected async resolvePermission(identity: unknown, choice: unknown) {

        if (!isPermissionChoice(choice)) return

        const pending = [...this.permissionRequests.values()].find(entry => entry.dialog.identity === identity)

        if (pending) await this.finishPermission(pending, choice)
    }

    /** Cancels one boundary-owned prompt without creating a decision. */
    public async cancelPermission(request: string, process: string) {

        const pending = this.permissionRequests.get(request)

        if (pending?.process === process) await this.finishPermission(pending, null)
    }

    private async finishPermission(pending: PendingPermission, choice: PermissionChoice) {

        if (!this.permissionRequests.delete(pending.request)) return

        this.permissionProcesses.delete(pending.process)
        this.dialogs.delete(pending.dialog.identity)
        pending.stopExit()
        pending.settle(choice)

        await this.$outbound.publish("/removed", pending.dialog.identity).catch(() => undefined)
    }

    /** Removes an acknowledged dialog once, including simultaneous acknowledgments. */
    @Subscribe("/acknowledge")
    protected async acknowledge(identity: unknown) {

        if (typeof identity !== "string" || this.dialogs.get(identity)?.kind !== "serverCrash" || !this.dialogs.delete(identity)) return

        await this.$outbound.publish("/removed", identity)
    }

    public toJSON() {

        return { dialogs: this.dialogs }
    }
}

export interface ServerCrashDialog {

    readonly identity: string

    readonly kind: "serverCrash"

    readonly createdAt: Date

    readonly program: Readonly<{

        identity: string

        name: string
    }>

    readonly process: Readonly<{

        identity: string

        name: string | null
    }>

    readonly code: number | null

    readonly signal: string | null
}

export interface PermissionDialog {

    readonly identity: string
    readonly kind: "permission"
    readonly createdAt: Date
    readonly permission: PermissionName
    readonly values: PermissionValue<PermissionName>[]
    readonly title: string
    readonly description: string
    readonly program: Readonly<{ identity: string, name: string }>
    readonly process: Readonly<{ identity: string, name: string | null }>
}

export type PermissionChoice = true | false | null

export type SystemDialog = ServerCrashDialog | PermissionDialog

interface PendingPermission {

    readonly request: string
    readonly dialog: PermissionDialog
    readonly process: string
    readonly settle: (choice: PermissionChoice) => void
    readonly stopExit: () => void
}

function isPermissionChoice(value: unknown): value is PermissionChoice {

    return value === true || value === false || value === null
}

export type DialogManagerSnapshot = ReturnType<DialogManager["toJSON"]>
