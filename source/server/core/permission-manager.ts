import { TheLink } from "@the-link/core"
import { Subscribe } from "@the-link/core/decorators"
import type {
    Permission,
    PermissionName,
    PermissionRequestSnapshot,
    PermissionScope
} from "@phreshos/core"
import type AuthManager from "./link-manager/auth-manager/auth-manager"
import type Process from "./link-manager/auth-manager/process-manager/process"
import { endpointReference } from "./link-manager/auth-manager/process-manager/endpoint-reference"

export const defaultPermissionRequestTimeout = 120_000

/** Authoritative lifecycle of pending permission decisions. */
export default class PermissionManager extends TheLink {

    private readonly pendingRequests = new Map<string, PendingPermissionRequest>()

    public constructor(private readonly authManager: AuthManager) {

        super()

        this.connectTo(authManager, "/permission")
    }

    public requests() {

        return [...this.pendingRequests.values()].map(request => request.snapshot)
    }

    public pending(identity: string) {

        return this.pendingRequests.has(identity)
    }

    /** Creates one request whose lifetime belongs to its exact Endpoint incarnation. */
    public async request<Name extends PermissionName>(
        process: Process,
        endpoint: "server" | "client",
        identity: string,
        name: Name,
        scope: PermissionScope<Name>,
        timeout: number
    ): Promise<Permission<Name>> {

        if (!identity || this.pendingRequests.has(identity)) throw new Error("A permission request needs a unique identity")
        if (endpoint === "server" ? !process.server : !process.client) throw new Error("The requesting Endpoint is not running")
        if (!Number.isFinite(timeout) || timeout < 0) throw new Error("A permission timeout must be a non-negative finite number")

        const createdAt = new Date()
        const expiresAt = new Date(createdAt.getTime() + timeout)

        if (Number.isNaN(expiresAt.getTime())) throw new Error("A permission request expiration is invalid")

        const snapshot = Object.freeze({
            identity,
            from: endpointReference(process, endpoint),
            createdAt,
            expiresAt: new Date(expiresAt),
            name,
            scope: Object.freeze([...scope])
        }) satisfies PermissionRequestSnapshot<Name>

        let settle: (permission: Permission<Name>) => void = () => undefined
        const result = new Promise<Permission<Name>>(resolve => { settle = resolve })
        const cancelEndpoint = endpoint === "server"
            ? process.onServerStop(() => { this.cancel(identity).catch(() => undefined) })
            : process.onClientStop(() => { this.cancel(identity).catch(() => undefined) })
        this.pendingRequests.set(identity, {
            process,
            snapshot: snapshot as PermissionRequestSnapshot,
            settle: settle as (permission: Permission) => void,
            timer: null,
            cancelEndpoint,
            resolving: false
        })

        await Promise.all([
            this.authManager.processManager.announceHost("permission", "request", process.program.identity, snapshot).catch(() => undefined),
            this.$outbound.publish("/request", snapshot).catch(() => undefined)
        ])

        const pending = this.pendingRequests.get(identity)

        // A request must become observable before its expiry can resolve it.
        // Otherwise a zero-duration request can publish resolve before request.
        if (pending) pending.timer = this.expire(identity, expiresAt)

        return await result
    }

    @Subscribe("/pending")
    protected requestPending(identity: unknown) {

        return typeof identity === "string" && this.pending(identity)
    }

    @Subscribe("/allow")
    public async allow(identity: unknown) {

        const request = this.claim(identity)

        try {
            await this.authManager.programManager.setPermission(request.process.program, request.snapshot.name, request.snapshot.scope)
            await this.finish(request, request.snapshot.scope)
        }
        catch (error) {
            if (this.pendingRequests.get(request.snapshot.identity) === request) request.resolving = false
            throw error
        }
    }

    @Subscribe("/deny")
    public async deny(identity: unknown) {

        const request = this.claim(identity)

        try {
            await this.authManager.programManager.setPermission(request.process.program, request.snapshot.name, false)
            await this.finish(request, false)
        }
        catch (error) {
            if (this.pendingRequests.get(request.snapshot.identity) === request) request.resolving = false
            throw error
        }
    }

    @Subscribe("/cancel")
    public async cancel(identity: unknown) {

        const request = this.claim(identity)

        try { await this.finish(request, null) }
        catch (error) {
            if (this.pendingRequests.get(request.snapshot.identity) === request) request.resolving = false
            throw error
        }
    }

    private claim(identity: unknown) {

        const request = typeof identity === "string" ? this.pendingRequests.get(identity) : undefined

        if (!request || request.resolving) throw new Error("The permission request does not exist")

        if (request.snapshot.expiresAt.getTime() <= Date.now()) {
            request.resolving = true
            void this.finish(request, null)
            throw new Error("The permission request does not exist")
        }

        // Claim synchronously before persistence or announcements so two
        // terminal operations can never both mutate the same request.
        request.resolving = true

        return request
    }

    private async finish(request: PendingPermissionRequest, permission: Permission) {

        if (!this.pendingRequests.delete(request.snapshot.identity)) throw new Error("The permission request does not exist")

        if (request.timer) clearTimeout(request.timer)
        request.cancelEndpoint()

        await Promise.all([
            this.authManager.processManager.announceHost(
                "permission",
                "resolve",
                request.process.program.identity,
                request.snapshot,
                permission
            ).catch(() => undefined),
            this.authManager.processManager.announceSubject(
                "permission",
                "resolve",
                request.snapshot.identity,
                request.snapshot,
                permission
            ).catch(() => undefined),
            this.$outbound.publish("/resolve", request.snapshot, permission).catch(() => undefined)
        ])

        request.settle(permission)
    }

    private expire(identity: string, expiresAt: Date): ReturnType<typeof setTimeout> {

        const maximumDelay = 2_147_483_647
        const remaining = expiresAt.getTime() - Date.now()

        return setTimeout(() => {

            if (remaining > maximumDelay) {

                const request = this.pendingRequests.get(identity)

                if (request) request.timer = this.expire(identity, expiresAt)
            }

            else this.cancel(identity).catch(() => undefined)
        }, Math.max(0, Math.min(maximumDelay, remaining)))
    }

    public toJSON() {

        return { requests: new Map(this.requests().map(request => [request.identity, request])) }
    }
}

interface PendingPermissionRequest {
    readonly process: Process
    readonly snapshot: PermissionRequestSnapshot
    readonly settle: (permission: Permission) => void
    timer: ReturnType<typeof setTimeout> | null
    readonly cancelEndpoint: () => void
    resolving: boolean
}

export type PermissionManagerSnapshot = ReturnType<PermissionManager["toJSON"]>
