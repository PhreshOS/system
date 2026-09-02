import { TransmittedProcessManager } from "@server/core/link-manager/auth-manager/process-manager/process-manager"
import { TransmittedProcess } from "@server/core/link-manager/auth-manager/process-manager/process"
import { TransmittedWindow } from "@server/core/link-manager/auth-manager/process-manager/window"
import { Publish, Subscribe } from "@the-link/core/decorators"
import { TheLink } from "@the-link/core"
import AuthManager from "../auth-manager"
import Process from "./process"
import { type ClientLaunch, type ServerLaunch } from "@phreshos/core"
import { type TrafficKind } from "@server/core/link-manager/auth-manager/process-manager/process-traffic"
import { type ServiceKey, type WindowLayer } from "@phreshos/core"
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

    /** The shown authoritative Window at the front of one projected layer. */
    public front(layer: WindowLayer) {

        let best: string | null = null

        let depth = -Infinity

        for (const [identity, process] of this.processes) {

            const window = process.client?.window

            if (!window || window.minimized || window.layer !== layer || window.depth <= depth) continue

            best = identity

            depth = window.depth
        }

        return best
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

    public async endpointIsService(source: string, target: HandleAddress, endpoint: "server" | "client") {

        return await this.$outbound.publishFirst("/endpoint/is-service", source, target, endpoint) as boolean
    }

    /** Reads current Endpoint existence for one exact Service address. */
    public async serviceExists(key: ServiceKey) {

        return await this.$outbound.publishFirst("/service/exists", key) as boolean
    }

    public async waitServiceReady(key: ServiceKey, timeout: number | undefined) {

        await this.$outbound.publishFirst("/service/wait-ready", key, timeout)
    }

    /** Registers one exact service interest for this frame lease. */
    public async followService(pane: string, owner: string, subscription: string, key: ServiceKey, scope: ServiceScope, event: string | null) {

        await this.$outbound.publish("/frame/service/follow", pane, owner, subscription, key, scope, event)
    }

    public async unfollowService(pane: string, owner: string, subscription: string) {

        await this.$outbound.publish("/frame/service/unfollow", pane, owner, subscription)
    }

    /** Sends to the live Endpoint behind one exact service key. */
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

    /** Registers one live Context interest for this exact frame document. */
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

    public async startEndpoint(identity: string, which: "server" | "client", launch?: ServerLaunch | ClientLaunch) {

        await this.$outbound.publish("/endpoint/start", identity, which, launch)
    }

    public async stopEndpoint(identity: string, which: "server" | "client") {

        await this.$outbound.publish("/endpoint/stop", identity, which)
    }

    /** Announces a locally changed counterpart to desktop representations. */
    public async changed() {

        await this.$inbound.publish("/processes", this.list())
    }

    // Any window change arrives in one shape: the process it belongs to,
    // and the window whole.
    private followed(payload: { identity: string, window: TransmittedWindow } | null) {

        if (!payload) return

        this.processes.get(payload.identity)?.client?.window.follow(payload.window)

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
    protected async serverStartHandle(identity: string | null, payload: TransmittedProcess | null) {

        if (!identity || !payload) return

        this.processes.get(identity)?.serverStarted(payload)

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

    @Subscribe("/geometry")
    @Publish("/processes", "inbound")
    protected async geometryHandle(payload: { identity: string, window: TransmittedWindow } | null) {

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

    @Subscribe("/end-end")
    protected async endEndHandle(identity: string, values: unknown[]) {

        this.$inbound.publish("/pane", identity, values).catch(() => undefined)
    }
}

interface HandleAddress {

    identity: string

    reference: string
}
