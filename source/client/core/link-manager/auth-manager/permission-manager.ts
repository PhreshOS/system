import type { Permission, PermissionRequestSnapshot } from "@phreshos/core"
import { Publish, Subscribe } from "@the-link/core/decorators"
import { TheLink } from "@the-link/core"
import type { PermissionManagerSnapshot } from "@server/core/permission-manager"
import type AuthManager from "./auth-manager"

/** Synchronized Desktop view of authoritative pending permission requests. */
export default class PermissionManager extends TheLink {

    public readonly requests: Map<string, PermissionRequestSnapshot>

    public constructor(authManager: AuthManager, payload: PermissionManagerSnapshot) {

        super()

        this.requests = new Map(payload.requests)

        this.connectTo(authManager, "/permission")
    }

    public list() {

        return [...this.requests.values()]
    }

    public pending(identity: string) {

        return this.requests.has(identity)
    }

    public async allow(identity: string) {

        await this.$outbound.publishFirst("/allow", identity)
    }

    public async deny(identity: string) {

        await this.$outbound.publishFirst("/deny", identity)
    }

    public async cancel(identity: string) {

        await this.$outbound.publishFirst("/cancel", identity)
    }

    @Subscribe("/request")
    @Publish("/requests", "inbound")
    protected async requested(request: PermissionRequestSnapshot) {

        this.requests.set(request.identity, request)

        return this.list()
    }

    @Subscribe("/resolve")
    @Publish("/requests", "inbound")
    protected async resolved(request: PermissionRequestSnapshot, _permission: Permission) {

        this.requests.delete(request.identity)

        return this.list()
    }
}
