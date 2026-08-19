import { TransmittedProcessManager } from "@server/core/link-manager/auth-manager/process-manager/process-manager"
import { TransmittedProcess } from "@server/core/link-manager/auth-manager/process-manager/process"
import { TransmittedWindow } from "@server/core/link-manager/auth-manager/process-manager/window"
import { Publish, Subscribe } from "@libs/the-link/decorators/escript"
import TheLink from "@libs/the-link/the-link"
import AuthManager from "../auth-manager"
import Process from "./process"
import { type LaunchClient } from "@server/core/link-manager/auth-manager/program-manager/program-manager"
import { type TrafficKind } from "@server/core/link-manager/auth-manager/process-manager/process-traffic"
import { isPermissionName, type ServiceKey } from "@phreshos/core"
import { type ServiceScope } from "@server/core/link-manager/auth-manager/process-manager/endpoint-services"

/**
 * The peer of the core's processes: born holding them from the
 * transmitted payload, and following every echo. Each process is one
 * long-lived instance for its whole life — echoes mutate it in place, so
 * a window keeps the element it was mounted on.
 *
 * After every change the derived list is re-emitted on this tunnel:
 * notification is the link, and a representation subscribes to the event
 * rather than to the object.
 */
export default class ProcessManager extends TheLink {

    public readonly authManager: AuthManager

    public readonly processes = new Map<string, Process>()

    public constructor(authManager: AuthManager, payload: TransmittedProcessManager) {

        super()

        this.authManager = authManager

        for (const [identity, process] of payload.processes) this.processes.set(identity, new Process(this, process))

        this.connectTo(this.authManager, "/process")
    }

    private list() {

        return [...this.processes.values()]
    }

    // The structural frame gate supplies `source`; Program code supplies only
    // the target and payload.
    public async publish(source: string, identity: string, which: "server" | "client", values: unknown[]) {

        await this.$outbound.publish("/send", source, identity, which, values)
    }

    /** Emit outward from the structurally identified Client Endpoint. */
    public async emit(source: string, event: string, payload: unknown) {

        await this.$outbound.publish("/emit", source, event, payload)
    }

    /** Changes the service exposed by the structurally identified Client Channel. */
    public async enableService(source: string, definition: unknown) {

        await this.$outbound.publishFirst("/service/enable", source, definition)
    }

    public async disableService(source: string) {

        await this.$outbound.publishFirst("/service/disable", source)
    }

    public async endpointService(source: string, target: HandleAddress, endpoint: "server" | "client") {

        return await this.$outbound.publishFirst("/service/current", source, target, endpoint) as ServiceKey | null
    }

    /** Explicit snapshot for one exact service key. */
    public async serviceDisabled(key: ServiceKey) {

        return await this.$outbound.publishFirst("/service/disabled", key) as boolean
    }

    public async serviceDocs(key: ServiceKey) {

        return await this.$outbound.publishFirst("/service/docs", key) as string | null
    }

    /** Registers one exact service interest for this frame lease. */
    public async followService(pane: string, owner: string, subscription: string, key: ServiceKey, scope: ServiceScope, event: string | null) {

        await this.$outbound.publish("/frame/service/follow", pane, owner, subscription, key, scope, event)
    }

    public async unfollowService(pane: string, owner: string, subscription: string) {

        await this.$outbound.publish("/frame/service/unfollow", pane, owner, subscription)
    }

    /** Sends to the live Server Endpoint behind one exact service key. */
    public async sendService(source: string, key: ServiceKey, event: string, payload: unknown) {

        await this.$outbound.publish("/service/send", source, key, event, payload)
    }

    public async askService(source: string, key: ServiceKey, values: unknown[]) {

        await this.$outbound.publish("/frame/service/ask", source, key, values)
    }

    // Handed on, not awaited. Whoever asked is holding the question by
    // its own name and will recognise the answer when it arrives.
    public async askOf(source: string, identity: string, values: unknown[]) {

        await this.$outbound.publish("/frame/ask", source, identity, values)
    }

    public async cancel(source: string, question: string) {

        await this.$outbound.publish("/frame/cancel", source, question)
    }

    // A frame document owns its forwarding interests. The opaque owner is
    // minted by this desktop session; the server adds the session from the
    // connection itself, so neither coordinate comes from program code.
    public async ownFrame(pane: string, owner: string) {

        await this.$outbound.publish("/frame/own", pane, owner)
    }

    public async releaseFrame(pane: string, owner: string) {

        await this.$outbound.publish("/frame/release", pane, owner)
    }

    /** Register one live Channel interest for this exact frame document. */
    public subscribeFrame(pane: string, owner: string, subscription: string, kind: TrafficKind, event: string | null) {

        return this.$outbound.publish("/frame/subscribe", pane, owner, subscription, kind, event)
    }

    public unsubscribeFrame(pane: string, owner: string, subscription: string) {

        return this.$outbound.publish("/frame/unsubscribe", pane, owner, subscription)
    }

    public async observe(pane: string, owner: string, subscription: string, target: HandleAddress, half: "server" | "client", kind: TrafficKind, event: string | null, reportImpossible: boolean) {

        await this.$outbound.publish("/frame/observe", pane, owner, subscription, target, half, kind, event, reportImpossible)
    }

    public async unobserve(pane: string, owner: string, subscription: string) {

        await this.$outbound.publish("/frame/unobserve", pane, owner, subscription)
    }

    public async follow(pane: string, owner: string, subscription: string, target: HandleAddress, half: "server" | "client", event: string | null, reportImpossible: boolean) {

        await this.$outbound.publish("/frame/follow", pane, owner, subscription, target, half, event, reportImpossible)
    }

    public async unfollow(pane: string, owner: string, subscription: string) {

        await this.$outbound.publish("/frame/unfollow", pane, owner, subscription)
    }

    // Private endpoint output. This deliberately bypasses the ordinary
    // request/response forwarding road: logs have no answer and no failure.
    public log(pane: string, kind: string, content: string) {

        this.authManager.emit("/process/frame/log", pane, kind, content)
    }

    public async exitAll(program: string, asker: string) {

        return await this.$outbound.publishFirst("/exit-all", program, asker) as string[]
    }

    public async startEndpoint(identity: string, which: "server" | "client", overrides?: LaunchClient) {

        await this.$outbound.publish("/endpoint/start", identity, which, overrides)
    }

    public async stopEndpoint(identity: string, which: "server" | "client") {

        await this.$outbound.publish("/endpoint/stop", identity, which)
    }

    @Subscribe("/permission")
    protected async permissionChanged(identity: unknown, permission: unknown, decision: unknown) {

        if (typeof identity !== "string" || !isPermissionName(permission) || (decision !== true && decision !== false && decision !== null)) return

        await this.$inbound.publish("/permission-changed", identity, permission, decision)
    }

    /** Announces a locally changed counterpart to desktop representations. */
    public async changed() {

        await this.$inbound.publish("/processes", this.list())
    }

    // Any window change arrives in one shape: the process it belongs to,
    // and the window whole.
    private followed(payload: { identity: string, window: TransmittedWindow } | null, surfaceChanged = false) {

        if (!payload) return

        this.processes.get(payload.identity)?.client?.window.follow(payload.window, surfaceChanged)

        return this.list()
    }

    @Subscribe("/created")
    @Publish("/processes", "inbound")
    protected async createdHandle(payload: TransmittedProcess | null) {

        if (!payload) return

        this.processes.set(payload.identity, new Process(this, payload))

        return this.list()
    }

    // A child's runtime reached its kit. Reflected onto the record so a
    // session's copy is as true as the host's, and offered to that
    // program's panes so a window can wait for its own half.
    @Subscribe("/server-ready")
    @Publish("/processes", "inbound")
    protected async serverReadyHandle(identity: string | null) {

        if (!identity) return

        const process = this.processes.get(identity)

        if (!process) return

        if (process.server) process.server.ready = true

        return this.list()
    }

    @Subscribe("/server-start")
    @Publish("/processes", "inbound")
    protected async serverStartHandle(identity: string | null, _payload: TransmittedProcess | null) {

        if (!identity) return

        this.processes.get(identity)?.serverStarted()

        return this.list()
    }

    @Subscribe("/server-stop")
    @Publish("/processes", "inbound")
    protected async serverStopHandle(identity: string | null, _payload: TransmittedProcess | null) {

        if (!identity) return

        this.processes.get(identity)?.serverStopped()

        return this.list()
    }

    @Subscribe("/client-start")
    @Publish("/processes", "inbound")
    protected async clientStartHandle(identity: string | null, payload: TransmittedProcess | null) {

        if (!identity || !payload) return

        this.processes.get(identity)?.clientStarted(payload)

        return this.list()
    }

    @Subscribe("/client-stop")
    @Publish("/processes", "inbound")
    protected async clientStopHandle(identity: string | null, _payload: TransmittedProcess | null) {

        if (!identity) return

        this.processes.get(identity)?.clientStopped()

        return this.list()
    }

    @Subscribe("/exited")
    @Publish("/processes", "inbound")
    protected async exitedHandle(payload: TransmittedProcess | null) {

        if (!payload) return

        this.processes.delete(payload.identity)

        return this.list()
    }

    @Subscribe("/move")
    @Publish("/processes", "inbound")
    protected async moveHandle(payload: { identity: string, window: TransmittedWindow } | null) {

        return this.followed(payload)
    }

    @Subscribe("/resize")
    @Publish("/processes", "inbound")
    protected async resizeHandle(payload: { identity: string, window: TransmittedWindow } | null) {

        return this.followed(payload)
    }

    @Subscribe("/raise")
    @Publish("/processes", "inbound")
    protected async raiseHandle(payload: { identity: string, window: TransmittedWindow } | null) {

        return this.followed(payload)
    }

    @Subscribe("/change-title")
    @Publish("/processes", "inbound")
    protected async changeTitleHandle(payload: { identity: string, window: TransmittedWindow } | null) {

        return this.followed(payload)
    }

    @Subscribe("/minimize")
    @Publish("/processes", "inbound")
    protected async minimizeHandle(payload: { identity: string, window: TransmittedWindow } | null) {

        return this.followed(payload)
    }

    @Subscribe("/surface")
    @Publish("/processes", "inbound")
    protected async surfaceHandle(payload: { identity: string, window: TransmittedWindow } | null) {

        return this.followed(payload, true)
    }

    @Subscribe("/end-end")
    protected async endEndHandle(identity: string, json: string) {

        this.$inbound.publish("/pane", identity, json).catch(() => undefined)
    }
}

interface HandleAddress {

    identity: string

    reference: string
}
