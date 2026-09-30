import type { OpenRequestSnapshot } from "@phreshos/core"
import { Publish, Subscribe } from "@the-link/core/decorators"
import { TheLink } from "@the-link/core"
import type { OpeningManagerSnapshot } from "@server/core/opening-manager"
import type AuthManager from "./auth-manager"

/** Synchronized Desktop view of open requests waiting for the owner's choice. */
export default class OpeningManager extends TheLink {

    public readonly requests: Map<string, OpenRequestSnapshot>

    public constructor(authManager: AuthManager, payload: OpeningManagerSnapshot) {

        super()

        this.requests = new Map(payload.requests)

        this.connectTo(authManager, "/opening")
    }

    public list() {

        return [...this.requests.values()]
    }

    public pending(identity: string) {

        return this.requests.has(identity)
    }

    public async choose(identity: string, program: string, options?: Readonly<{ always?: boolean }>) {

        await this.$outbound.publishFirst("/choose", identity, program, options)
    }

    public async cancel(identity: string) {

        await this.$outbound.publishFirst("/cancel", identity)
    }

    public async defaults() {

        return await this.$outbound.publishFirst("/defaults") as Readonly<Record<string, string>>
    }

    public async setDefault(type: unknown, program: unknown) {

        await this.$outbound.publishFirst("/set-default", type, program)
    }

    public async clearDefault(type: unknown) {

        await this.$outbound.publishFirst("/clear-default", type)
    }

    @Subscribe("/request")
    @Publish("/requests", "inbound")
    protected async requested(request: OpenRequestSnapshot) {

        this.requests.set(request.identity, request)

        return this.list()
    }

    @Subscribe("/resolve")
    @Publish("/requests", "inbound")
    protected async resolved(request: OpenRequestSnapshot, _program: string | null) {

        this.requests.delete(request.identity)

        return this.list()
    }
}
