import { type PermissionChoice, type SystemDialog, type TransmittedDialogManager } from "@server/core/dialog-manager"
import { Publish, Subscribe } from "@the-link/core/decorators"
import { TheLink } from "@the-link/core"
import AuthManager from "./auth-manager"

/** Synchronized desktop counterpart of the authoritative system-dialog queue. */
export default class DialogManager extends TheLink {

    public readonly authManager: AuthManager

    public readonly dialogs: Map<string, SystemDialog>

    public constructor(authManager: AuthManager, payload: TransmittedDialogManager) {

        super()

        this.authManager = authManager

        this.dialogs = new Map(payload.dialogs)

        this.connectTo(this.authManager, "/dialog")
    }

    public list() {

        return [...this.dialogs.values()]
    }

    public async acknowledge(identity: string) {

        await this.$outbound.publish("/acknowledge", identity)
    }

    public async resolvePermission(identity: string, choice: PermissionChoice) {

        await this.$outbound.publish("/resolve-permission", identity, choice)
    }

    @Subscribe("/created")
    @Publish("/dialogs", "inbound")
    protected async created(dialog: SystemDialog | null) {

        if (!dialog) return

        this.dialogs.set(dialog.identity, dialog)

        return this.list()
    }

    @Subscribe("/removed")
    @Publish("/dialogs", "inbound")
    protected async removed(identity: string | null) {

        if (!identity) return

        this.dialogs.delete(identity)

        return this.list()
    }
}
