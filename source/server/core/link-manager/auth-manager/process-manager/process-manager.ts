import { Subscribe } from "@the-link/core/decorators"
import { type Options } from "../program-manager/program-manager"
import Program from "../program-manager/program"
import { Layer } from "../program-manager/config"
import Window, { Position, Size } from "./window"
import { TheLink } from "@the-link/core"
import AuthManager from "../auth-manager"
import Process, { type HostedProcess, type ProcessLaunch, type ProcessSnapshot } from "./process"
import ServerProcessBoundary from "./server-process-boundary"
import ProcessTraffic, { type Half, type TrafficKind } from "./process-traffic"
import ClientProcessForwarder from "./client-process-forwarder"
import HostTraffic from "./host-traffic"
import { failed, succeeded, type RequestOutcome } from "@libs/request-outcome"
import { endpointReference, processReference } from "./endpoint-reference"
import EndpointEvents from "./endpoint-events"
import EndpointServices, { serviceTimeout } from "./endpoint-services"
import OutsideQuestions from "./outside-questions"
import {
    isServiceAddress,
    isUploadFile,
    parsePermissionName,
    parseProgramInstallOptions,
    parseProgramUninstallOptions,
    type ClientLaunch,
    type Launch,
    type Permission,
    type PermissionName,
    type PermissionRequestInput,
    type PermissionValue,
    type ProgramIconSize,
    type ServerLaunch,
    type ServiceAddress,
    type WindowGeometry,
    type WindowLayer,
    type WindowState
} from "@phreshos/core"
import { isDesktopReplacementLayer, type DesktopReplacementLayer } from "@shared/window-layers"
import type { ServerRuntime, ServerRuntimeFactory } from "@server/core/server-runtime"
import SystemAccess from "./system-access"
import { WebSocket } from "ws"
import { permissionCatalog } from "@server/core/permissions"
import { defaultPermissionRequestTimeout } from "@server/core/permission-manager"

type SerializedClientLayer = DesktopReplacementLayer | "shell"

function isSerializedClientLayer(layer: Layer | undefined): layer is SerializedClientLayer {
    return layer === "shell" || isDesktopReplacementLayer(layer)
}

/**
 * The core's processes: the wire and the collection. Each process owns
 * itself — its Endpoint execution contexts and serialisation — and this manager
 * routes: it holds them by identity, carries operations in from connections,
 * and broadcasts what changed.
 *
 * The channel speaks three envelopes named by route. end-end is relayed
 * to the program's other end untouched; end-host terminates in the
 * vocabulary below, the finite set of words a program may address to its
 * environment; host-end is what this side says of its own accord.
 */

export default class ProcessManager extends TheLink {

    public readonly authManager: AuthManager

    public readonly processes = new Map<string, Process>()

    // Application traffic is an event route, not manager state. Each Process
    // boundary subscribes directly and owns the resulting cleanup.
    private readonly traffic = new ProcessTraffic()

    // Destinationless events remain separate from directed traffic. A source
    // Endpoint speaks once; only boundaries following that Endpoint join.
    private readonly endpointEvents = new EndpointEvents()

    // Services route to running Endpoint execution contexts. They own no registration state
    // and never control the Process or Endpoint they address.
    private readonly services: EndpointServices

    // Host facts use their own the-link routes. A server boundary joins only
    // the event and subject routes its endpoint explicitly requested.
    private readonly hostTraffic = new HostTraffic()

    // The remote half of each desktop boundary lease. It owns only that
    // document's forwarding interests and disappears with the lease.
    private readonly clientForwarders = new Map<string, ClientProcessForwarder>()

    /** Live observations owned by an authenticated System representation. */
    private readonly connectionObservations = new Map<string, Map<string, () => void>>()

    private readonly serverSockets = new WeakMap<ServerProcessBoundary, Map<string, WebSocket>>()

    // Endpoint transitions for one Process are serialized. State is changed in
    // one place, so two simultaneous stop requests cannot both believe the
    // other endpoint will preserve the Process lifetime.
    private readonly transitions = new Map<string, Promise<void>>()

    private readonly stoppingServers = new Set<ServerProcessBoundary>()

    private readonly outsideQuestions = new OutsideQuestions()

    private highest = 0

    // Questions name their waiting endpoint in their correlation address.
    // The host reads that address only to route the answer. The source Process
    // boundary retains the cancellation forwarding for its lifetime, but no
    // host owns the Promise, timer, callback, or result.
    public constructor(authManager: AuthManager) {

        super()

        this.authManager = authManager

        this.services = new EndpointServices(
            address => this.resolveService(address),
            () => this.processes.values(),
            (event, address) => Promise.all([
                this.hostTraffic.emitHost("service", event, address.process, address),
                this.$outbound.publish(`/service-${event}`, address)
            ])
        )

        this.connectTo(this.authManager, "/process")

    }

    private find(identity: string) {

        const process = this.processes.get(identity)

        if (!process) throw new Error("The host does not know this process")

        return process
    }

    private resolveService(address: ServiceAddress) {

        const program = this.authManager.programManager.reach(address.program)
        const process = program
            ? [...this.processes.values()].find(candidate => candidate.program === program && candidate.name === address.process)
            : null
        const service = address.endpoint === "server" ? process?.server?.service : process?.client?.service

        return process && service === true ? { process, endpoint: address.endpoint } : null
    }

    private heldWindow(value: unknown, fallback: Process) {

        const process = this.system.holdProcess(value, fallback)

        const window = process.clientEndpoint?.window

        if (!window) throw new Error("This Program declared no Client Endpoint")

        return { process, window }
    }

    private windowOf(identity: string) {

        const window = this.find(identity).clientEndpoint?.window

        if (!window) throw new Error("This Program declared no Client Endpoint")

        return window
    }

    private mutableWindowOf(identity: string) {

        const process = this.find(identity)

        if (!process.client) throw new Error("This Client Endpoint is not running")

        const window = this.windowOf(identity)

        return window
    }

    private get system() { return this.authManager.linkManager.application.system }

    /** Complete public Window state, shared by every representation. */
    public windowSnapshot(identity: string): WindowState {

        const process = this.find(identity)

        if (!process.client) throw new Error("This Client Endpoint is not running")

        const window = this.windowOf(identity)

        return Object.freeze({
            title: window.title,
            header: window.header,
            position: window.position,
            size: window.size,
            minimized: window.minimized,
            maximized: window.maximized,
            front: this.front(window.layer) === process.identity,
            layer: window.layer
        })
    }

    /** Observe one authoritative host fact without creating a Program boundary. */
    public observeHost(domain: "program" | "process" | "window" | "connection" | "session" | "service" | "permission", event: string, subject: string | null, subscriber: (event: string, ...values: unknown[]) => void) {

        return this.hostTraffic.observe(domain, event, subject, (_delivery, word, ...values) => subscriber(word, ...values))
    }

    /** Observe destinationless events from one exact live Endpoint. */
    public observeEndpoint(identity: string, half: Half, event: string | null, subscriber: (payload: unknown, event: string) => void, impossible?: (reason: string) => void) {

        const process = this.find(identity)

        if (half === "server" ? !process.server : !process.client) throw new Error(`This process has no live ${half} endpoint`)

        return this.endpointEvents.follow(process.reference, half, event, (word, payload) => subscriber(payload, word), impossible)
    }

    /** Observe directed application traffic originating from one Endpoint. */
    public observeTrafficFromOutside(identity: string, half: Half, kind: TrafficKind, event: string | null, subscriber: (event: string, ...values: unknown[]) => void, impossible?: (reason: string) => void) {

        const process = this.find(identity)

        if (!process.program[half]) throw new Error(`This program declared no ${half} endpoint`)

        return this.traffic.observe(process.reference, half, kind, event, subscriber, impossible)
    }

    /** Publish from a trusted execution boundary whose identity is not a Program Endpoint. */
    public async publishFromOutside(identity: string, half: Half, event: string, payload: unknown) {

        const process = this.find(identity)

        if (half === "server" ? !process.server : !process.client) throw new Error(`This process has no live ${half} endpoint`)

        await this.deliver(identity, half, [event, { from: null, payload }])
    }

    /** Ask a Server from a trusted execution boundary whose identity is intentionally hidden. */
    public askFromOutside(identity: string, event: string, payload: unknown, timeout = 10_000, signal?: AbortSignal) {

        const process = this.find(identity)
        const target = process.server

        if (!target) return Promise.reject(new Error("This process has no live server endpoint"))

        return this.outsideQuestions.ask(target, timeout, signal, (question, publicQuestion) => (
            this.deliver(identity, "server", [
                "wait",
                question,
                publicQuestion,
                event,
                { from: null, payload }
            ])
        ))
    }

    public serviceAvailableFromOutside(address: unknown) {

        return this.services.available(address)
    }

    public listServicesFromOutside(name?: string) { return this.services.list(name) }

    public endpointIsServiceFromOutside(identity: string, endpoint: Half) {

        const process = this.find(identity)

        return endpoint === "server" ? process.server?.service === true : process.client?.service === true
    }

    public waitServiceReadyFromOutside(address: unknown, timeout?: number) {

        return this.services.waitReady(address, timeout)
    }

    /** Publish through a Service from an owner boundary represented by `from: null`. */
    public async publishServiceFromOutside(address: unknown, event: string, payload: unknown) {

        const target = this.services.target(address)

        if (!target) throw new Error("The Service is unavailable")

        await this.deliver(target.process.identity, target.endpoint, [event, { from: null, payload }])
    }

    /** Ask a Server Service from an owner boundary represented by `from: null`. */
    public askServiceFromOutside(address: unknown, event: string, payload: unknown, timeout = 10_000, signal?: AbortSignal) {

        const target = this.services.target(address, "server")

        if (!target) return Promise.reject(new Error("The Service is unavailable"))

        return this.askFromOutside(target.process.identity, event, payload, timeout, signal)
    }

    public observeServiceFromOutside(address: unknown, scope: "lifecycle" | "events", event: string | null, subscriber: (event: string, payload: unknown) => unknown) {

        return this.services.follow(address, scope, event, subscriber)
    }

    /** Publish to an Endpoint from the invoking System representation. */
    @Subscribe("/endpoint/publish")
    protected async publishForConnection(target: unknown, endpoint: unknown, event: unknown, payload: unknown) {

        if (typeof event !== "string") throw new Error("An Endpoint event must be text")

        const process = this.find(String(target))

        await this.publishFromOutside(process.identity, half(endpoint), event, payload)
    }

    /** Ask a Server Endpoint from the invoking System representation. */
    @Subscribe("/endpoint/ask")
    protected askForConnection(target: unknown, event: unknown, payload: unknown, timeout: unknown) {

        if (typeof event !== "string") throw new Error("An Endpoint event must be text")

        const process = this.find(String(target))

        return this.askFromOutside(process.identity, event, payload, serviceTimeout(timeout), this.authManager.connectionSignal())
    }

    /** Publish through a Service from the invoking System representation. */
    @Subscribe("/service/publish")
    protected async publishServiceForConnection(address: unknown, event: unknown, payload: unknown) {

        if (typeof event !== "string") throw new Error("A Service event must be text")

        await this.publishServiceFromOutside(address, event, payload)
    }

    /** Ask a Server Service from the invoking System representation. */
    @Subscribe("/service/ask")
    protected askServiceForConnection(address: unknown, event: unknown, payload: unknown, timeout: unknown) {

        if (typeof event !== "string") throw new Error("A Service event must be text")

        return this.askServiceFromOutside(address, event, payload, serviceTimeout(timeout), this.authManager.connectionSignal())
    }

    // The boundary owns its server runtime transport. A stopped child remains
    // fire-and-forget: there is no receiver to promise once it has gone.
    private say(server: ServerProcessBoundary | null | undefined, event: string, ...values: unknown[]) {

        return server?.deliver(event, ...values).catch(() => undefined) ?? Promise.resolve()
    }

    private clientOwnerKey(connection: string, pane: string) {

        return `${connection}:${pane}`
    }

    private observation(target: Process, half: string): { half: Half } | { error: string } {

        if (half === "server") return target.program.server ? { half: "server" } : { error: "This program declared no server half" }

        if (half === "client") return target.program.client ? { half: "client" } : { error: "This program declared no client half" }

        return { error: `A process has no "${half}" end` }
    }

    private observeServer(owner: Process, subscription: string, target: Process, half: string, kind: TrafficKind, event: string | null, reportImpossible: boolean) {

        if (!owner.server) return

        const observation = this.observation(target, half)

        if ("error" in observation) {

            if (reportImpossible) owner.server.impossible(subscription, observation.error)

            return
        }

        owner.server.observe(this.traffic, subscription, target.reference, observation.half, kind, event, reportImpossible)
    }

    private unobserveServer(owner: Process, subscription: string) {

        owner.server?.unobserve(subscription)
    }

    private followServer(owner: Process, subscription: string, target: Process, half: string, event: string | null, reportImpossible: boolean) {

        if (!owner.server) return

        const observation = this.observation(target, half)

        if ("error" in observation) {

            if (reportImpossible) owner.server.impossible(subscription, observation.error)

            return
        }

        owner.server.follow(this.endpointEvents, subscription, target.reference, observation.half, event, reportImpossible)
    }

    private unfollowServer(owner: Process, subscription: string) {

        owner.server?.unfollow(subscription)
    }

    private ownClient(connection: string, pane: string, owner: string) {

        if (!this.authManager.linkManager.boundaries.has(connection) || !this.processes.get(pane)?.client) return

        const key = this.clientOwnerKey(connection, pane)

        const current = this.clientForwarders.get(key)

        if (current?.owner === owner) return

        current?.release()

        this.clientForwarders.set(key, new ClientProcessForwarder(connection, pane, owner, this.authManager, this.traffic, this.endpointEvents, values => this.clientVisibleTraffic(pane, values)))
    }

    private releaseClient(connection: string, pane: string, owner: string) {

        const key = this.clientOwnerKey(connection, pane)

        const current = this.clientForwarders.get(key)

        if (current?.owner !== owner) return

        current.release()

        this.clientForwarders.delete(key)
    }

    private registerClientObservation(connection: string, pane: string, owner: string, subscription: string, target: unknown, half: string, kind: TrafficKind, event: string | null, reportImpossible: boolean) {

        const boundary = this.clientForwarders.get(this.clientOwnerKey(connection, pane))

        if (boundary?.owner !== owner) return

        let observed: Process

        try {

            observed = this.system.holdProcess(target)
        }

        catch (error) {

            if (reportImpossible) boundary.impossible(subscription, error instanceof Error ? error.message : "The desktop does not know this process")

            return
        }

        const observation = this.observation(observed, half)

        if ("error" in observation) {

            if (reportImpossible) boundary.impossible(subscription, observation.error)

            return
        }

        boundary.observe(subscription, observed.reference, observation.half, kind, event, reportImpossible)
    }

    private clientVisibleTraffic(_pane: string, values: unknown[]) {

        return values
    }

    private removeClientObservation(connection: string, pane: string, owner: string, subscription: string) {

        const boundary = this.clientForwarders.get(this.clientOwnerKey(connection, pane))

        if (boundary?.owner === owner) boundary.unobserve(subscription)
    }

    private registerClientFollow(connection: string, pane: string, owner: string, subscription: string, target: unknown, half: string, event: string | null, reportImpossible: boolean) {

        const boundary = this.clientForwarders.get(this.clientOwnerKey(connection, pane))

        if (boundary?.owner !== owner) return

        let observed: Process

        try {

            observed = this.system.holdProcess(target)
        }

        catch (error) {

            if (reportImpossible) boundary.impossible(subscription, error instanceof Error ? error.message : "The desktop does not know this process")

            return
        }

        const observation = this.observation(observed, half)

        if ("error" in observation) {

            if (reportImpossible) boundary.impossible(subscription, observation.error)

            return
        }

        boundary.follow(subscription, observed.reference, observation.half, event, reportImpossible)
    }

    private removeClientFollow(connection: string, pane: string, owner: string, subscription: string) {

        const boundary = this.clientForwarders.get(this.clientOwnerKey(connection, pane))

        if (boundary?.owner === owner) boundary.unfollow(subscription)
    }

    private registerClientSubscription(connection: string, pane: string, owner: string, subscription: string, event: string | null) {

        const boundary = this.clientForwarders.get(this.clientOwnerKey(connection, pane))

        if (boundary?.owner === owner) boundary.subscribe(subscription, event)
    }

    private removeClientSubscription(connection: string, pane: string, owner: string, subscription: string) {

        const boundary = this.clientForwarders.get(this.clientOwnerKey(connection, pane))

        if (boundary?.owner === owner) boundary.unsubscribe(subscription)
    }

    private retainClientQuestion(connection: string, source: string, question: string, target: string) {

        const address = addressed(question)

        if (address?.half !== "client" || address.identity !== source) throw new Error("A client question must return to its own Process boundary")

        const boundary = this.clientForwarders.get(this.clientOwnerKey(connection, source))

        if (!boundary) throw new Error("The desktop does not own this client Process boundary")

        const server = this.processes.get(target)?.server

        if (!server) return false

        boundary.retain(question, () => server.forget(question))

        return true
    }

    private answerClientQuestion(source: string, question: string, values: unknown[]) {

        for (const boundary of this.clientForwarders.values()) {

            if (boundary.pane === source && boundary.answer(question, values)) return
        }
    }

    private rejectClientQuestion(connection: string, pane: string, values: unknown[], reason: string) {

        if (values[0] !== "wait" || typeof values[1] !== "string" || typeof values[2] !== "string" || typeof values[3] !== "string") return

        const answer = ["answer", values[1], values[2], values[3], failed(new Error(reason))]

        this.authManager.publishToBoundary(connection, "/process/end-end", pane, answer).catch(() => undefined)
    }

    public releaseConnection(connection: string) {

        for (const [key, boundary] of this.clientForwarders) {

            if (!key.startsWith(`${connection}:`)) continue

            boundary.release()

            this.clientForwarders.delete(key)
        }

        const observations = this.connectionObservations.get(connection)

        if (observations) for (const stop of observations.values()) stop()

        this.connectionObservations.delete(connection)
    }

    /** Attach one live domain observation to the invoking connection. */
    @Subscribe("/follow")
    protected followConnection(subscription: unknown, value: unknown) {

        if (typeof subscription !== "string" || !subscription) throw new Error("A System observation identity is required")
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A System observation is required")

        const connection = this.authManager.connection()
        const observations = this.connectionObservations.get(connection) ?? new Map<string, () => void>()

        observations.get(subscription)?.()
        this.connectionObservations.set(connection, observations)

        const observation = value as Record<string, unknown>
        const event = observation.event === null || typeof observation.event === "string" ? observation.event : invalid("A System observation event must be text or null")
        const followed = (received: string, payload: unknown) => this.authManager.publishToBoundary(connection, "/process/followed", subscription, received, payload).catch(() => undefined)
        const impossible = (reason: string) => {

            this.removeConnectionObservation(connection, subscription)
            this.authManager.publishToBoundary(connection, "/process/impossible", subscription, reason).catch(() => undefined)
        }

        let stop: () => void

        if (observation.scope === "endpoint") {

            const endpoint = half(observation.endpoint)
            const process = this.find(String(observation.process))

            stop = this.observeEndpoint(process.identity, endpoint, event, (payload, received) => followed(received, payload), impossible)
        }

        else if (observation.scope === "traffic") {

            const endpoint = half(observation.endpoint)
            const kind = trafficKind(observation.kind)
            const process = this.find(String(observation.process))

            stop = this.observeTrafficFromOutside(process.identity, endpoint, kind, event, (received, ...values) => followed(received, values), impossible)
        }

        else if (observation.scope === "service") {

            if (observation.kind !== "events" && observation.kind !== "lifecycle") throw new Error("A Service observation kind is events or lifecycle")

            stop = this.observeServiceFromOutside(observation.address, observation.kind, event, followed)
        }

        else throw new Error("A System observation scope is endpoint, traffic, or service")

        observations.set(subscription, stop)
    }

    /** Release one observation without affecting its connection or siblings. */
    @Subscribe("/unfollow")
    protected unfollowConnection(subscription: unknown) {

        if (typeof subscription === "string") this.removeConnectionObservation(this.authManager.connection(), subscription)
    }

    private removeConnectionObservation(connection: string, subscription: string) {

        const observations = this.connectionObservations.get(connection)

        observations?.get(subscription)?.()
        observations?.delete(subscription)

        if (!observations?.size) this.connectionObservations.delete(connection)
    }

    public retainClientOperation(connection: string, pane: string, operation: string, cancel: () => void) {

        const boundary = this.clientForwarders.get(this.clientOwnerKey(connection, pane))

        if (!boundary) return null

        boundary.retain(operation, cancel)

        return () => boundary.forget(operation)
    }

    // Raw boundary delivery. Application publications and questions are
    // shaped before they reach this point so the receiving SDK sees the
    // source Endpoint supplied by the host rather than by Program code.
    private deliver(identity: string, half: "server" | "client", values: unknown[]) {

        const process = this.processes.get(identity)

        if (!process) return Promise.resolve()

        if (half === "server") {

            if (!process.server) return Promise.resolve()

            return this.say(process.server, "end-end", ...values)
        }

        if (!process.client) return Promise.resolve()

        return Promise.all([...this.clientForwarders.values()]
            .filter(boundary => boundary.pane === identity)
            .map(boundary => boundary.forward(values))).then(() => undefined)
    }

    private publish(source: string, sourceHalf: "server" | "client", target: string, targetHalf: "server" | "client", values: unknown[]) {

        const event = values[0]

        if (typeof event !== "string") return Promise.resolve()

        const sourceProcess = this.processes.get(source)

        const targetProcess = this.processes.get(target)

        if (!sourceProcess || !targetProcess) return Promise.resolve()

        const payload = values[1]

        const received = {

            from: endpointReference(sourceProcess, sourceHalf),

            payload
        }

        const observed = this.traffic.emit(sourceProcess.reference, sourceHalf, "publish", event, {

            to: endpointReference(targetProcess, targetHalf),

            payload
        })

        return Promise.all([observed, this.deliver(target, targetHalf, [event, received])]).then(() => undefined)
    }

    // Answers travel to the address written by the waiting endpoint. The host
    // reads that private address only to choose the return boundary; observers
    // receive the separate public id and can correlate it themselves.
    private returnAnswer(answerer: Process | null, values: unknown[]) {

        if (values[0] !== "answer" || typeof values[1] !== "string" || typeof values[2] !== "string" || typeof values[3] !== "string") return false

        const back = addressed(values[1])

        if (!back) return false

        if (back.half === "outside") {

            this.outsideQuestions.answer(values[1], values[4] as RequestOutcome)

            return true
        }

        const process = this.processes.get(back.identity)

        const outcome = values[4] as RequestOutcome

        if (answerer && process) {

            this.traffic.emit(answerer.reference, "server", "answer", values[3], values[2], {

                to: endpointReference(process, back.half),

                outcome
            }).catch(() => undefined)
        }

        if (back.half === "server") {

            if (!process?.server) return true

            this.say(process.server, "end-end", ...values)

            return true
        }

        this.answerClientQuestion(back.identity, values[1], values)

        return true
    }

    private rejectQuestion(values: unknown[], reason: string) {

        if (values[0] !== "wait" || typeof values[1] !== "string" || typeof values[2] !== "string" || typeof values[3] !== "string") return

        this.returnAnswer(null, ["answer", values[1], values[2], values[3], failed(new Error(reason))])
    }

    private transition(process: Process, change: () => Promise<void> | void, whenGone: "reject" | "complete" = "reject") {

        const before = this.transitions.get(process.identity) ?? Promise.resolve()

        const next = before.catch(() => undefined).then(async () => {

            if (this.processes.get(process.identity) !== process) {

                if (whenGone === "complete") return

                throw new Error("The process no longer exists")
            }

            await change()
        })

        this.transitions.set(process.identity, next)

        next.finally(() => {

            if (this.transitions.get(process.identity) === next) this.transitions.delete(process.identity)
        }).catch(() => undefined)

        return next
    }

    private bindServer(process: Process, server: ServerProcessBoundary) {

        server.$inbound.forwardTo((event, ...values) => {

            if (process.server !== server || event === "boundary") return

            if (event === "end-end") {

                if (values[0] === "answer" && typeof values[1] === "string") server.answered(values[1])

                if (this.returnAnswer(process, values)) return

                this.publish(process.identity, "server", process.identity, "client", values).catch(() => undefined)

                return
            }

            if (event === "end-host") {

                if (values[0] === "stream" && typeof values[1] === "string") {

                    this.endHostStream(process, server, values[1], values.slice(2)).catch(() => undefined)

                    return
                }

                if (values[0] === "wait" && typeof values[1] === "string") {

                    this.endHostWait(process, server, values[1], values.slice(2)).catch(() => undefined)

                    return
                }

                this.endHost(process, server, values).catch(() => undefined)
            }
        })

        server.$inbound.subscribe("boundary-ready", (ready: unknown) => {

            if (ready !== true || process.server !== server) return

            process.serverBecameReady(server)

            this.$outbound.publish("/server-ready", process.identity).catch(() => undefined)

            this.services.ready(process, "server").catch(() => undefined)
        })
    }

    private async endpointEvent(event: EndpointEvent, process: Process, endpoint: "server" | "client") {

        const record = processReference(process)

        await this.hostTraffic.emitSubject("process", event, process.reference, record, endpoint)
    }

    private async serverStarted(process: Process) {

        await this.$outbound.publish("/server-start", process.identity, process.hosted())

        // Readiness can arrive while the start announcement is crossing to
        // the desktop. Repeating the current fact after that awaited crossing
        // guarantees the desktop never applies ready before it knows the new
        // incarnation exists.
        if (process.server?.ready) await this.$outbound.publish("/server-ready", process.identity)

        await Promise.all([
            this.endpointEvent("endpointStart", process, "server"),
            this.services.started(process, "server")
        ])
    }

    private async serverEnded(process: Process, boundary: ServerProcessBoundary, code: number | null, signal: NodeJS.Signals | null) {

        const explicitlyStopped = this.stoppingServers.delete(boundary)

        const finish = async () => {

            if (process.server !== boundary) return

            await completeEvery("The server endpoint ended with incomplete cleanup", [

                () => { process.serverStopped(boundary, code, signal) },

                () => this.services.stopped(process, "server", boundary.service),

                () => { boundary.release() },

                () => this.$outbound.publish("/server-stop", process.identity, process.hosted(), code, signal),

                () => this.endpointEvent("endpointStop", process, "server"),

                // An unexpected server end invalidates the complete execution. Only the
                // explicit server.stop() road may intentionally leave the client
                // state alive without its server counterpart.
                async () => {

                    if (explicitlyStopped) return

                    this.authManager.linkManager.application.logs.record(
                        "error",
                        "process",
                        "unexpectedServerEndpointExit",
                        unexpectedServerEndpointExitContent(process, code, signal),
                        {
                            program: { identity: process.program.identity, name: process.program.name },
                            process: { identity: process.identity, name: process.name },
                            endpoint: "server",
                            code,
                            signal
                        }
                    )
                },

                async () => {

                    if (!explicitlyStopped && process.client) await this.deactivateClient(process)
                },

                async () => {

                    if (!process.live) await this.remove(process.identity, code, signal)
                }
            ])
        }

        if (explicitlyStopped) await finish()

        else await this.transition(process, finish).catch(() => undefined)
    }

    private activateServer(process: Process, runtime: ServerRuntime, service: boolean) {

        const server = process.startServer(runtime, service,

            (boundary, code, signal) => this.serverEnded(process, boundary, code, signal),

            (values, reason) => this.rejectQuestion(values, reason),

            this.authManager.linkManager.appearance.tunnel,

            (domain, subject) => this.serverHostVisible(process, domain, subject)
        )

        this.bindServer(process, server)

        return server
    }

    private serverHostVisible(process: Process, domain: "program" | "process" | "connection" | "session" | "service" | "window" | "permission" | "log" | "programLog", subject: string | null) {

        const access = new SystemAccess(this, process)

        if (domain === "connection" || domain === "session") return access.canAuthentication()

        if (domain === "permission") return access.all()

        if (domain === "log") return this.grants(process.identity, "logs", [])

        if (domain === "programLog") {

            if (!subject) return false

            const program = [...this.authManager.programManager.programs.values()].find(entry => entry.program.reference === subject)?.program

            return program ? access.canProgram(program) : false
        }

        if (!subject) return false

        if (domain === "service") return this.grants(process.identity, "services", [subject])

        if (domain === "program") {

            const program = [...this.authManager.programManager.programs.values()].find(entry => entry.program.reference === subject)?.program

            return program ? access.canProgram(program) : false
        }

        const target = [...this.processes.values()].find(candidate => candidate.reference === subject)

        return target ? access.canProcess(target) : false
    }

    private window() {

        return new Window()
    }

    private startWindow(window: Window, shape: Shape) {

        window.start(
            { title: shape.title, header: shape.header, layer: shape.layer },
            shape.position,
            shape.size,
            ++this.highest,
            shape.minimize,
            shape.maximize
        )
    }

    private readonly layerClaims = new Map<SerializedClientLayer, Promise<unknown>>()

    private serializeClientLayer<Result>(layer: Layer | undefined, work: () => Promise<Result>): Promise<Result> {
        if (!isSerializedClientLayer(layer)) return work()
        const current = this.layerClaims.get(layer) ?? Promise.resolve()
        const next = current.catch(() => undefined).then(work)
        this.layerClaims.set(layer, next.catch(() => undefined))
        return next
    }

    private async replaceDesktopPresentation(layer: DesktopReplacementLayer) {
        const occupied = [...this.processes.values()].filter(process => process.client && process.clientEndpoint?.window.layer === layer)
        for (const process of occupied) await this.exitProcess(process.identity, "complete")
    }

    private async claimShell(program: Program) {
        // Shell ownership belongs to a Program: its sibling Processes coexist,
        // while another Program must observe the previous owner fully stopped.
        const displaced = [...this.processes.values()].filter(process =>
            process.program !== program && process.client && process.clientEndpoint?.window.layer === "shell"
        )
        for (const process of displaced) await this.exitProcess(process.identity, "complete")
    }

    private async prepareClientLayer(layer: Layer, program: Program) {
        if (layer === "shell") return this.claimShell(program)
        if (isDesktopReplacementLayer(layer)) return this.replaceDesktopPresentation(layer)
    }

    /** Claims the role after serialized replacement has released its previous owner. */
    private activateClient(process: Process, service: boolean) {
        const window = process.clientEndpoint?.window
        if (!window) throw new Error("This Program declared no Client Endpoint")
        if (isDesktopReplacementLayer(window.layer) && [...this.processes.values()].some(
            current => current !== process && current.client && current.clientEndpoint?.window.layer === window.layer
        )) throw new Error(`A Client Endpoint is already running in the ${window.layer} layer`)
        if (window.layer === "shell" && [...this.processes.values()].some(
            current => current !== process && current.program !== process.program && current.client && current.clientEndpoint?.window.layer === "shell"
        )) throw new Error("Another Program already occupies the shell layer")

        process.startClient(service)
    }

    public async register(identity: string, name: string | null, program: Program, options: Options, launch: ProcessLaunch, runtime: ServerRuntimeFactory<Program> | null, client: boolean, shape: Shape | null, parent: Process | null, registration?: ProcessRegistration) {

        return await this.serializeClientLayer(client ? shape?.layer : undefined, () =>
            this.registerProcess(identity, name, program, options, launch, runtime, client, shape, parent, registration))
    }

    private async registerProcess(identity: string, name: string | null, program: Program, options: Options, launch: ProcessLaunch, createRuntime: ServerRuntimeFactory<Program> | null, client: boolean, shape: Shape | null, parent: Process | null, registration?: ProcessRegistration) {

        if (this.processes.has(identity)) {

            throw new Error("The host already knows this process identity")
        }

        if (name !== null && [...this.processes.values()].some(process => process.program === program && process.name === name)) {

            throw new Error("This program already has a process with that name")
        }

        if (client && shape) await this.prepareClientLayer(shape.layer, program)

        // Who had focus before this one opened, in the layer it is
        // opening into. A window is born on top of its own layer and
        // takes focus from whoever held it there; the other layers
        // do not hear about it.
        const front = shape && this.front(shape.layer)

        const window = registration?.window || shape ? this.window() : null

        const process = new Process(

            identity,

            name,

            program,

            options,

            launch,

            parent,

            this.hostTraffic,

            window
        )

        this.processes.set(identity, process)

        process.ownExit(() => this.exitProcess(identity))

        process.onExit((code, signal) => { this.remove(identity, code, signal).catch(() => undefined) })

        let runtime: ServerRuntime | null = null

        try {

            registration?.prepare?.(process)

            runtime = createRuntime?.(program) ?? null

            // Initial activation is one endpoint transition too. A server that
            // exits immediately is queued behind it, preserving the only coherent
            // order: Process creation, endpoint start, endpoint stop, Process exit.
            await this.transition(process, async () => {

                if (client && window && shape) {
                    this.startWindow(window, shape)
                    this.activateClient(process, launch.client?.service ?? false)
                }

                if (runtime) this.activateServer(process, runtime, launch.server?.service ?? false)

                // The subject first, which is what scopes a listener without
                // anything being checked: a kit's `Events` refuses a value whose
                // first item is not the subject it was built for, so a program's
                // listener hears only its own program's news by the shape of the
                // message rather than by a rule somewhere reading it.
                //
                // An unscoped listener — `host` — is built for no subject and so
                // receives the subject as its first value.
                await Promise.all([

                    this.announceHost("process", "create", program.identity, processReference(process)),

                    this.announceSubject("program", "processCreate", program.reference, processReference(process))
                ])

                await this.$outbound.publish("/created", process.hosted())

                registration?.created?.(process)

                if (process.client && window) this.settleFront(window.layer, front)

                if (process.server) await this.serverStarted(process)

                if (process.client) {

                    await this.$outbound.publish("/client-start", process.identity, process.hosted())

                    await Promise.all([
                        this.endpointEvent("endpointStart", process, "client"),
                        this.services.started(process, "client")
                    ])
                }
            })
        }

        catch (error) {

            // A runtime that failed before becoming this Process's boundary has
            // no lifecycle callback through which it can be stopped.
            if (!process.server) runtime?.stop()

            // Registration is transactional from the registry's perspective.
            // Normal teardown retracts every endpoint and announcement that may
            // already have crossed before the failing step.
            await this.exitProcess(identity, "complete").catch(() => undefined)

            throw error
        }

        return process
    }

    public async remove(identity: string, code: number | null = 0, signal: NodeJS.Signals | null = null) {

        const process = this.processes.get(identity)

        if (!process) return

        // Who had focus while this one was still here, in its own layer.
        // A window closing hands it to whatever is left showing
        // underneath *it* — a layer emptying hands nothing across.
        const layer = process.client ? process.clientEndpoint?.window.layer ?? null : null

        const front = layer && this.front(layer)

        const serverWasLive = process.server !== null
        const clientWasLive = process.client !== null
        const serverWasService = process.server?.service === true
        const clientWasService = process.client?.service === true

        const failures = await settleEvery([
            ...serverWasLive ? [() => this.services.stopped(process, "server", serverWasService)] : [],
            ...clientWasLive ? [() => this.services.stopped(process, "client", clientWasService)] : []
        ])

        // Another converging teardown may have completed while services were
        // releasing. Only the teardown that removes this exact entity emits its
        // terminal facts.
        if (this.processes.get(identity) !== process) {

            throwFailures("The process ended with incomplete cleanup", failures)

            return
        }

        this.processes.delete(identity)

        failures.push(...await settleEvery([

            () => { process.server?.release("The process ended before answering") },

            () => { this.releaseClientForwarders(identity) },

            // Dropping the record is an ending, and for a program with no
            // server half it is the only one there will ever be.
            () => { process.ended(code, signal) },

            // The subject leads so that narrowing is the shape of the
            // message, and what follows is the thing the event is about —
            // the process, whole, not an identity a listener would have to look
            // up. It is already gone, which is what `exited()` answers and
            // why holding it is legitimate.
            () => Promise.all([

                this.announceHost("process", "exit", process.program.identity, processReference(process), code, signal),

                this.announceSubject("program", "processExit", process.program.reference, processReference(process), code, signal)
            ]),

            // The same ending, said to whoever holds this one process rather
            // than to whoever watches the program. A launcher wants the
            // second; a program managing its instances wants the first.
            () => this.hostTraffic.emitSubject("process", "exit", process.reference, code, signal),

            // The window that had it is gone, so nobody is told they lost
            // it — only whoever inherits it is told they have it.
            () => { if (layer) this.settleFront(layer, front) },

            // Whose it was, said rather than looked up. A session holds the
            // record too and drops it on this same event, so anything that
            // needed to know the program would be racing the handler that
            // removes it — and which of them ran first would decide whether
            // the answer existed.
            // And when it started, because the record is gone by the time a
            // session reads this and that is the one thing an ending cannot
            // recover — a listener handed a process must be handed the whole
            // of one, or the shape a handle promises is not the shape it has.
            () => this.$outbound.publish("/exited", process.hosted(), code, signal),

            () => this.traffic.end(process.reference, "The process ended — no further events are possible"),

            () => this.endpointEvents.end(process.reference, "The process ended — no further events are possible"),

            () => { this.transitions.delete(identity) }
        ]))

        throwFailures("The process ended with incomplete cleanup", failures)
    }

    public async startServer(identity: string, launch: ServerLaunch = {}) {

        const process = this.find(identity)

        await this.transition(process, async () => {

            if (!process.program.server) throw new Error("This program declared no server half")

            if (typeof launch !== "object" || launch === null || Array.isArray(launch) || launch.service !== undefined && typeof launch.service !== "boolean") throw new Error("A Server launch must contain an optional boolean service value")

            if (process.server) return

            await process.program.validate()

            const runtime = this.authManager.programManager.serverRuntime(process.program)

            try {

                this.activateServer(process, runtime, launch.service ?? process.program.server.service)

                await this.serverStarted(process)
            }

            catch (error) {

                // activateServer mutates Process state across a method boundary,
                // which TypeScript cannot infer after the precondition above.
                const boundary = process.server as ServerProcessBoundary | null

                if (boundary) {

                    this.stoppingServers.add(boundary)

                    boundary.stop()

                    // Do not await here. A runtime may already have ended and
                    // queued its natural cleanup behind this transition; waiting
                    // for it from inside the transition would deadlock both.
                    boundary.finished.finally(() => { this.stoppingServers.delete(boundary) }).catch(() => undefined)
                }

                else runtime.stop()

                throw error
            }
        })

        return identity
    }

    public async stopServer(identity: string) {

        const process = this.find(identity)

        await this.transition(process, async () => {

            if (!process.program.server) throw new Error("This Program declared no Server Endpoint")

            if (!process.server) return

            if (!process.client) throw new Error("The final live endpoint cannot be stopped; exit the Process instead")

            const stopping = process.server

            this.stoppingServers.add(stopping)

            stopping.stop()

            await stopping.finished
        })

        return identity
    }

    public async startClient(identity: string, launch: ClientLaunch = {}) {

        const process = this.find(identity)

        const shape = this.authManager.programManager.clientShape(process.program, launch)

        return await this.serializeClientLayer(shape.layer, () => this.startClientInLayer(identity, launch, shape))
    }

    private async startClientInLayer(identity: string, launch: ClientLaunch, shape: StandardShape) {

        const process = this.find(identity)

        await this.transition(process, async () => {

            const declaration = process.program.client

            if (!declaration) throw new Error("This program declared no client half")

            if (process.client) return

            await process.program.validate()

            const window = process.clientEndpoint?.window

            if (!window) throw new Error("This Program declared no Client Endpoint")

            // Every Client execution owns a fresh authoritative Window. No
            // value from the previous execution is available to inherit.
            this.startWindow(window, shape)

            const before = this.front(window.layer)

            await this.prepareClientLayer(window.layer, process.program)

            this.activateClient(process, launch.service ?? declaration.service)

            try {

                await this.$outbound.publish("/client-start", process.identity, process.hosted())

                this.settleFront(window.layer, before)

                await Promise.all([
                    this.endpointEvent("endpointStart", process, "client"),
                    this.services.started(process, "client")
                ])
            }

            catch (error) {

                await this.deactivateClient(process).catch(() => undefined)

                throw error
            }
        })

        return identity
    }

    public async stopClient(identity: string) {

        const process = this.find(identity)

        await this.transition(process, async () => {

            if (!process.program.client) throw new Error("This Program declared no Client Endpoint")

            if (!process.client) return

            if (!process.server) throw new Error("The final live endpoint cannot be stopped; exit the Process instead")

            await this.deactivateClient(process)
        })

        return identity
    }

    private async deactivateClient(process: Process) {

        const layer = process.client ? process.clientEndpoint?.window.layer ?? null : null

        const service = process.client?.service === true

        const before = layer ? this.front(layer) : null

        await completeEvery("The client endpoint stopped with incomplete cleanup", [

            () => { process.stopClient() },

            () => this.services.stopped(process, "client", service),

            () => { this.releaseClientForwarders(process.identity) },

            () => this.$outbound.publish("/client-stop", process.identity, process.hosted()),

            () => { if (layer) this.settleFront(layer, before) },

            () => this.endpointEvent("endpointStop", process, "client")
        ])
    }

    private releaseClientForwarders(identity: string) {

        const failures: unknown[] = []

        for (const [key, boundary] of this.clientForwarders) {

            if (boundary.pane !== identity) continue

            try { boundary.release() }

            catch (error) { failures.push(error) }

            this.clientForwarders.delete(key)
        }

        throwFailures("The client boundary ended with incomplete cleanup", failures)
    }

    private async exitProcess(identity: string, whenGone: "reject" | "complete" = "reject") {

        const process = whenGone === "complete" ? this.processes.get(identity) : this.find(identity)

        if (!process) return identity

        await this.transition(process, async () => {

            const server = process.server

            await completeEvery("The process exited with incomplete cleanup", [

                // Classify and stop the child before awaiting any other teardown.
                // Otherwise a natural child exit during an awaited client
                // announcement could queue behind this transition while this
                // transition waits for that same child's completion.
                async () => {

                    if (!server) return

                    this.stoppingServers.add(server)

                    server.stop()

                    await server.finished
                },

                async () => {

                    if (process.client) await this.deactivateClient(process)
                },

                async () => {

                    if (this.processes.get(process.identity) === process) await this.remove(process.identity)
                }
            ])
        }, whenGone)

        return identity
    }

    // Every instance of one program, ended. The asker goes last when it
    // is one of them: killed first, it would never issue the rest.
    //
    // One implementation for both roads — a process asks over its
    // channel, a pane over the link — because two that agreed today
    // would be two that could stop agreeing.
    @Subscribe("/exit-all")
    public async exitAll(program: string, asker: string | null = null) {

        const owner = this.authManager.programManager.reachOrRefuse(program)

        const ended = [...this.processes.values()].filter(entry => entry.program === owner).map(entry => entry.identity)

        // Exit-all converges with another owner already ending one of these
        // Processes. A direct exit keeps the strict default above.
        for (const identity of [...ended.filter(identity => identity !== asker), ...ended.filter(identity => identity === asker)]) await this.exitProcess(identity, "complete")

        return ended
    }

    // A desktop supplies the publishing pane separately from the destination.
    // The pane comes from its structural frame gate rather than application
    // data, so a client cannot attribute its publication to another Process.
    @Subscribe("/send")
    public async publishClient(source: string, identity: string, which: string, values: unknown[]) {

        if (which !== "server" && which !== "client") throw new Error(`A process has no "${which}" end`)

        if (!this.find(source).client) throw new Error("The publishing process has no live client endpoint")

        await this.publish(source, "client", identity, which, values)
    }

    /** A Client emits from the structurally identified pane, never a claimed source. */
    @Subscribe("/emit")
    public async emitClient(source: string, event: string, payload: unknown) {

        const process = this.find(source)

        if (!process.client) return

        await Promise.all([

            this.endpointEvents.emit(process.reference, "client", event, payload),

            this.services.emit(process, "client", event, payload)
        ])
    }

    @Subscribe("/endpoint/is-service")
    protected async clientEndpointIsService(source: string, target: unknown, endpoint: unknown) {

        const process = this.find(source)

        if (!process.client) throw new Error("The current client endpoint is not running")

        if (endpoint !== "server" && endpoint !== "client") throw new Error("A service Endpoint must be server or client")

        const held = this.system.holdProcess(target)

        if (held.program !== process.program) throw new Error("The desktop does not know this process")

        return endpoint === "server" ? held.server?.service === true : held.client?.service === true
    }

    @Subscribe("/service/available")
    protected async serviceAvailable(address: unknown) {

        return this.services.available(address)
    }

    @Subscribe("/service/list")
    protected async listServices() { return this.services.list() }

    @Subscribe("/service/search")
    protected async searchServices(name: unknown) {

        if (typeof name !== "string" || !name.trim()) throw new Error("A Service name is required")

        return this.services.list(name)
    }

    @Subscribe("/service/wait-ready")
    protected async waitServiceReady(address: unknown, timeout: unknown) {

        await this.services.waitReady(address, timeout, this.authManager.connectionSignal())
    }

    @Subscribe("/service/program-metadata")
    protected async serviceProgramMetadata(address: unknown) {

        if (!isServiceAddress(address)) throw new Error("A complete Service address is required")

        const target = this.services.target(address)

        if (!target) throw new Error("The Service is unavailable")

        const program = target.process.program

        return Object.freeze({ name: program.name, version: program.version })
    }

    @Subscribe("/service/program-icon")
    protected async serviceProgramIcon(address: unknown, iconSize: unknown = "medium") {

        if (!isServiceAddress(address)) throw new Error("A complete Service address is required")

        const target = this.services.target(address)

        if (!target) throw new Error("The Service is unavailable")

        const icon = await this.authManager.programManager.icon(target.process.program, iconSize)

        // Rendering can outlive one provider incarnation; never return an icon
        // after the exact Service target that authorized the read has vanished.
        const current = this.services.target(address)

        if (!current || current.process !== target.process || current.endpoint !== target.endpoint) {
            throw new Error("The Service is unavailable")
        }

        return icon
    }

    @Subscribe("/service/send")
    protected async sendClientService(source: string, address: unknown, event: unknown, payload: unknown) {

        if (!isServiceAddress(address) || typeof event !== "string") return

        const process = this.find(source)

        if (!process.client) return

        const target = this.services.target(address)

        if (target) await this.publish(process.identity, "client", target.process.identity, target.endpoint, [event, payload])
    }

    @Subscribe("/frame/own")
    protected ownClientFrame(pane: string, owner: string) {

        this.ownClient(this.authManager.connection(), pane, owner)
    }

    @Subscribe("/frame/release")
    protected releaseClientFrame(pane: string, owner: string) {

        this.releaseClient(this.authManager.connection(), pane, owner)
    }

    @Subscribe("/frame/subscribe")
    protected subscribeClientFrame(pane: string, owner: string, subscription: string, kind: unknown, event: unknown) {

        if (kind !== "publish" || event !== null && typeof event !== "string") return

        this.registerClientSubscription(this.authManager.connection(), pane, owner, subscription, event)
    }

    @Subscribe("/frame/unsubscribe")
    protected unsubscribeClientFrame(pane: string, owner: string, subscription: string) {

        this.removeClientSubscription(this.authManager.connection(), pane, owner, subscription)
    }

    @Subscribe("/frame/observe")
    protected observeClientFrame(pane: string, owner: string, subscription: string, target: unknown, half: string, kind: unknown, event: unknown, reportImpossible: unknown) {

        if (!isTrafficKind(kind)) return

        if (event !== null && typeof event !== "string") return

        this.registerClientObservation(this.authManager.connection(), pane, owner, subscription, target, half, kind, event, reportImpossible === true)
    }

    @Subscribe("/frame/unobserve")
    protected unobserveClientFrame(pane: string, owner: string, subscription: string) {

        this.removeClientObservation(this.authManager.connection(), pane, owner, subscription)
    }

    @Subscribe("/frame/follow")
    protected followClientFrame(pane: string, owner: string, subscription: string, target: unknown, half: string, event: unknown, reportImpossible: unknown) {

        if (event !== null && typeof event !== "string") return

        this.registerClientFollow(this.authManager.connection(), pane, owner, subscription, target, half, event, reportImpossible === true)
    }

    @Subscribe("/frame/unfollow")
    protected unfollowClientFrame(pane: string, owner: string, subscription: string) {

        this.removeClientFollow(this.authManager.connection(), pane, owner, subscription)
    }

    @Subscribe("/frame/service/follow")
    protected followClientService(pane: string, owner: string, subscription: unknown, address: unknown, scope: unknown, event: unknown) {

        const boundary = this.clientForwarders.get(this.clientOwnerKey(this.authManager.connection(), pane))

        if (boundary?.owner !== owner || typeof subscription !== "string" || !isServiceAddress(address)) return

        if (scope !== "lifecycle" && scope !== "events") return

        if (event !== null && typeof event !== "string") return

        if (!this.grants(pane, "services", [address.process])) return

        boundary.followService(this.services, subscription, address, scope, event, () => {

            const process = this.processes.get(pane)

            return process !== undefined && this.authManager.programManager.grantsPermission(process.program, "services", [address.process])
        })
    }

    @Subscribe("/frame/service/unfollow")
    protected unfollowClientService(pane: string, owner: string, subscription: unknown) {

        const boundary = this.clientForwarders.get(this.clientOwnerKey(this.authManager.connection(), pane))

        if (boundary?.owner === owner && typeof subscription === "string") boundary.unfollowService(subscription)
    }

    @Subscribe("/frame/log")
    protected logClientFrame(pane: string, kind: unknown, content: unknown) {

        if (typeof kind !== "string" || typeof content !== "string") return

        const process = this.processes.get(pane)

        if (!process?.client) return

        this.authManager.programManager.record(process.program, process.identity, "client", kind, content)
    }

    /** Announces one fact only through an authoritative Host registry. */
    public async announceHost(domain: "program" | "process" | "connection" | "session" | "service" | "permission" | "log" | "programLog", event: string, subject: string, ...values: unknown[]) {

        await this.hostTraffic.emitHost(domain, event, subject, ...values)
    }

    /** Announces one fact only to observers of an exact Program or Process subject. */
    public async announceSubject(domain: "program" | "process" | "connection" | "session" | "service" | "permission" | "log" | "programLog", event: string, subject: string, ...values: unknown[]) {

        await this.hostTraffic.emitSubject(domain, event, subject, ...values)
    }

    /** Reads only the persistent user grant belonging to this Process's Program. */
    public permission<Name extends PermissionName>(identity: string, name: Name) {

        return this.authManager.programManager.permission(this.find(identity).program, name)
    }

    /** Tests one concrete permission for the Program executing this Process. */
    public grants<Name extends PermissionName>(identity: string, name: Name, requested: readonly PermissionValue<Name>[]) {

        const process = this.find(identity)

        return this.authManager.programManager.grantsPermission(process.program, name, requested)
    }

    /** Tests one native Storage target against this Process's effective grants. */
    public grantsStorage(identity: string, path: string, operation?: "read" | "write" | "delete") {

        const process = this.find(identity)

        return this.authManager.programManager.grantsStorage(process.program, path, operation)
    }

    /** Requests one owner decision for the Program of an exact live Endpoint. */
    public async requestPermission<Name extends PermissionName>(
        identity: string,
        endpoint: "server" | "client",
        request: string,
        name: Name,
        input: PermissionRequestInput<Name>,
        timeout: unknown
    ): Promise<Permission<Name>> {

        const process = this.find(identity)
        const requested = permissionCatalog.resolve(name, input)
        const duration = timeout === undefined ? defaultPermissionRequestTimeout : timeout

        if (!Array.isArray(requested)) throw new Error("A permission request must be true or a list of values")
        if (!request) throw new Error("A permission request needs a unique identity")
        if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0) throw new Error("A permission timeout must be a non-negative finite number")
        if (Number.isNaN(new Date(Date.now() + duration).getTime())) throw new Error("A permission request expiration is invalid")

        // An already-satisfied request has no pending lifecycle occurrence.
        if (!permissionCatalog.changed(this.authManager.programManager.permission(process.program, name), requested)) return requested

        return this.authManager.permissionManager.request(process, endpoint, request, name, requested, duration)
    }

    // A window's news, said once and heard by both kinds of half.
    //
    // A server half hears it over its own channel. A client half is a
    // frame in a session, so the same words go out to the sessions and
    // the desktop posts them into the frame — relayed verbatim rather
    // than worked out again there. Coming to the front is a transition,
    // and a second place deciding when they happened is a second place
    // that can decide differently.
    private said(identity: string, event: string, value: unknown) {

        const process = this.processes.get(identity)

        if (process?.client) this.hostTraffic.emitSubject("window", event, process.reference, value).catch(() => undefined)

        this.$outbound.publish("/said", identity, event, value).catch(() => undefined)
    }

    // The host's vocabulary — the words a program may address to its
    // environment. Predefined and finite: the kits' named operations
    // compile to exactly these. Unknown words are refused, so a
    // misspelling fails loudly instead of vanishing.
    protected async endHost(process: Process, server: ServerProcessBoundary, args: unknown[]): Promise<unknown[]> {

        const [word, ...rest] = args

        const access = new SystemAccess(this, process)

        const heldProgram = (value: unknown, fallback: Program = process.program) => access.program(this.system.holdProgram(value, fallback))

        const heldProcess = (value: unknown, fallback: Process = process) => access.process(this.system.holdProcess(value, fallback))

        const heldWindow = (value: unknown) => {

            const window = this.heldWindow(value, process)

            access.process(window.process)

            return window
        }

        const heldService = (value: unknown) => {

            if (!isServiceAddress(value)) throw new Error("A complete Service address is required")

            if (!this.grants(process.identity, "services", [value.process])) throw new Error("Execution is not permitted")

            return value
        }

        if (word === "host-program-list") return [this.system.listPrograms(rest[0] === true).filter(program => access.canProgram(program))]

        if (typeof word === "string" && word.startsWith("host-authentication-")) {

            if (word === "host-authentication-state") {

                access.require("authentication", [])

                return [this.system.authenticationState()]
            }

            if (word === "host-authentication-requirements") {

                access.require("authentication", [])

                return [this.system.authenticationRequirements()]
            }

            if (word === "host-authentication-set-credentials") {

                access.require("authentication", [])

                await this.system.setAuthenticationCredentials(rest[0])

                return []
            }

            if (word === "host-authentication-sign-out-all-sessions") {

                access.require("authentication", [])

                await this.system.signOutAllSessions()

                return []
            }

            if (word === "host-authentication-connections") {

                if (!access.canAuthentication()) return [[]]

                return [this.system.listConnections().map(connection => this.authManager.linkManager.connectionSnapshot(connection))]
            }

            if (word === "host-authentication-connection") {

                if (!access.canAuthentication()) return [null]

                const connection = this.system.findConnection(String(rest[0]))

                return [connection ? this.authManager.linkManager.connectionSnapshot(connection) : null]
            }

            if (word === "host-authentication-sessions") {

                if (!access.canAuthentication()) return [[]]

                return [this.system.listSessions().map(identity => this.authManager.linkManager.sessionSnapshot(identity))]
            }

            if (word === "host-authentication-session") {

                if (!access.canAuthentication()) return [null]

                const session = this.system.findSession(String(rest[0]))

                return [session ? this.authManager.linkManager.sessionSnapshot(session) : null]
            }
        }

        if (typeof word === "string" && (word.startsWith("host-connection-") || word.startsWith("host-session-"))) {

            if (word.startsWith("host-connection-") && !access.canAuthentication()) throw new Error("Connection not found")

            if (word === "host-connection-state") return [this.system.connectionSnapshot(String(rest[0]))]

            if (word === "host-connection-session") return [this.system.connectionSession(String(rest[0]))]

            if (word === "host-connection-sign-in") return [await this.system.signInConnection(String(rest[0]))]

            if (!access.canAuthentication()) throw new Error("Session not found")

            if (word === "host-session-state") return [this.system.sessionSnapshot(String(rest[0]))]

            if (word === "host-session-connections") {

                return [this.system.sessionConnections(String(rest[0])).map(connection => this.authManager.linkManager.connectionSnapshot(connection))]
            }

            if (word === "host-session-sign-out") {

                await this.system.signOutSession(String(rest[0]))

                return []
            }
        }

        if (word === "host-program-find") {

            const identity = String(rest[0])

            const found = this.system.findProgram(identity)

            return [found && access.canProgram(found) ? found : null]
        }

        if (word === "current-program") return [this.system.requireProgram(process.program.identity)]

        if (word === "context-permission-request") {

            if (typeof rest[0] !== "string") throw new Error("A permission request needs a unique identity")

            const permission = parsePermissionName(rest[1])

            return [await this.requestPermission(
                process.identity,
                "server",
                rest[0],
                permission,
                rest[2] as PermissionRequestInput<typeof permission>,
                rest[3]
            )]
        }

        if (word === "host-permission-requests") {

            access.requireAll()

            return [this.authManager.permissionManager.requests()]
        }

        if (typeof word === "string" && word.startsWith("permission-request-")) {

            access.requireAll()

            const operation = word.slice("permission-request-".length)

            if (operation === "pending") return [this.authManager.permissionManager.pending(String(rest[0]))]
            if (operation === "allow") await this.authManager.permissionManager.allow(rest[0])
            else if (operation === "deny") await this.authManager.permissionManager.deny(rest[0])
            else if (operation === "cancel") await this.authManager.permissionManager.cancel(rest[0])
            else throw new Error(`The System does not know the PermissionRequest operation "${operation}"`)

            return []
        }

        if (word === "program-permissions") {

            const program = heldProgram(rest[0])

            const operation = rest[1]

            if (operation === "all") return [this.authManager.programManager.permissions(program)]
            if (operation === "get") return [this.authManager.programManager.permission(program, parsePermissionName(rest[2]))]
            if (operation === "allows") {

                const permission = parsePermissionName(rest[2])

                return [this.authManager.programManager.allowsPermission(program, permission, rest[3] as PermissionRequestInput<typeof permission>)]
            }
            if (operation === "allow") {

                access.requireAll()
                const permission = parsePermissionName(rest[2])

                await this.authManager.programManager.setPermission(
                    program,
                    permission,
                    rest[3] as PermissionRequestInput<typeof permission>
                )

                return []
            }
            if (operation === "deny") {

                access.requireAll()
                await this.authManager.programManager.setPermission(program, parsePermissionName(rest[2]), false)

                return []
            }
            throw new Error(`The System does not know the Program permission operation "${String(operation)}"`)
        }

        if (word === "program-agent") {

            const program = heldProgram(rest[0])

            return [await this.system.programAgent(program)]
        }

        if (word === "program-definition") {

            return [await this.system.programDefinition(heldProgram(rest[0]))]
        }

        if (word === "current-process") return [processReference(process)]

        if (word === "icon") {

            return [await this.system.programIcon(heldProgram(rest[0]), rest[1])]
        }

        if (word === "startup") {

            const program = heldProgram(rest[0])

            const value = rest[1] === "enable" ? access.launch(rest[2]) : rest[2]

            return [await this.system.programStartup(program, String(rest[1]), value)]
        }

        if (word === "pinned") {

            const operation = rest[1]
            if (operation !== "get" && operation !== "pin" && operation !== "unpin") throw new Error(`The System does not know the pinned operation "${String(operation)}"`)
            return [await this.system.programPinned(heldProgram(rest[0]), operation)]
        }

        // Which exact process made this one through `program.createProcess()`.
        // Parentage is immutable lineage; liveness belongs to the returned
        // Process handle rather than to this relationship.
        if (word === "parent") {

            const target = heldProcess(rest[0])

            if (!target.parent) return [null]

            return [processReference(target.parent)]
        }

        // A program brought into being by a program enters the same
        // registry and returns the same record shape as every other
        // program. Its installed flag begins false.
        if (word === "host-program-create") {

            access.requireAll()

            const source = rest[0]

            if (typeof source !== "string" && (typeof source !== "object" || source === null)) throw new Error("A program is created from a config or a path")

            const created = await this.system.createProgram(source as Parameters<(typeof this.system)["createProgram"]>[0])

            return [this.system.requireProgram(created.identity)]
        }

        if (word === "host-program-force-create") {

            access.requireAll()

            const source = rest[0]

            if (typeof source !== "string" && (typeof source !== "object" || source === null)) throw new Error("A program is created from a config or a path")

            const created = await this.system.forceCreateProgram(source as Parameters<(typeof this.system)["forceCreateProgram"]>[0], process.identity)

            return [this.system.requireProgram(created.identity)]
        }

        if (word === "appearance") return [this.system.appearance]

        if (word === "update-appearance") {

            access.require("appearance", [])

            await this.system.updateAppearance(rest[0])

            return []
        }

        if (word === "installed") {

            return [this.system.programInstalled(heldProgram(rest[0]))]
        }

        if (word === "forget") {

            const program = heldProgram(rest[0])

            return [await this.system.forgetProgram(program, process.identity)]
        }

        if (word === "program-create-process") {

            const program = heldProgram(rest[0])

            // The whole record, not the identity alone: the kit builds a
            // Process from this answer, and a record invented at the
            // other end — identity and program, nothing else — was how every
            // process held by its launcher had no startedAt while every
            // other road's did.
            return [processReference(this.system.requireProcess(await this.system.createProcess(program, access.launch(rest[1]), process)))]
        }

        if (word === "program-find-or-create-process") {

            const program = heldProgram(rest[0])

            return [processReference(this.system.requireProcess(await this.system.findOrCreateProcess(program, access.launch(rest[1]) as Launch & { name: string }, process)))]
        }

        // Named, only that program's instances; unnamed, every one.
        if (word === "host-process-list" || word === "program-processes") {

            const living = this.system.listProcesses()

            if (word === "host-process-list") return [living.filter(target => access.canProcess(target)).map(processReference)]

            // Resolved before it is filtered. Filtering alone answered
            // an empty list for a program the system does not know,
            // which reads as *running nothing* and is a different claim
            // from *there is no such program* — every other act on one
            // refuses, and a word that answers falsely where its
            // neighbours refuse is worse than either.
            const program = heldProgram(rest[0])

            return [this.system.listProcesses(program).map(processReference)]
        }

        if (word === "program-find-process") {

            const program = heldProgram(rest[0])

            const wanted = String(rest[1])

            const found = this.system.findProcess(wanted, program)

            return [found ? processReference(found) : null]
        }

        if (word === "host-process-find") {

            if (typeof rest[0] === "string") {

                const target = this.system.findProcess(rest[0])

                return [target && access.canProcess(target) ? processReference(target) : null]
            }

            return [null]
        }

        if (word === "running") {

            const target = heldProcess(rest[1])

            if (rest[0] === "server") {

                if (!target.program.server) throw new Error("This Program declared no Server Endpoint")

                return [target.server !== null]
            }

            if (rest[0] === "client") {

                if (!target.program.client) throw new Error("This Program declared no Client Endpoint")

                return [target.client !== null]
            }

            throw new Error("A Process endpoint is server or client")
        }

        if (word === "is-service") {

            const target = heldProcess(rest[1])
            const endpoint = rest[0] ?? "server"

            if (endpoint !== "server" && endpoint !== "client") throw new Error("A Process endpoint is server or client")

            if (!target.program[endpoint]) throw new Error(`This Program declared no ${endpoint === "server" ? "Server" : "Client"} Endpoint`)

            return [endpoint === "server" ? target.server?.service === true : target.client?.service === true]
        }

        if (word === "start-endpoint") {

            const target = heldProcess(rest[0])

            if (rest[1] === "server") return [await this.system.startEndpoint(target, "server", rest[2] as ServerLaunch | undefined)]

            if (rest[1] === "client") return [await this.system.startEndpoint(target, "client", access.clientLaunch(rest[2]))]

            throw new Error("A Process endpoint is server or client")
        }

        if (word === "stop-endpoint") {

            const target = heldProcess(rest[0])

            if (rest[1] === "server") return [await this.system.stopEndpoint(target, "server")]

            if (rest[1] === "client") return [await this.system.stopEndpoint(target, "client")]

            throw new Error("A Process endpoint is server or client")
        }

        if (word === "stop-current") return [await this.system.stopEndpoint(process, "server")]

        if (word === "host-service-list") return [this.services.list().filter(address => this.grants(process.identity, "services", [address.process]))]

        if (word === "host-service-search") {

            const name = rest[0]

            if (typeof name !== "string" || !name.trim()) throw new Error("A Service name is required")

            return [this.grants(process.identity, "services", [name]) ? this.services.list(name) : []]
        }

        if (word === "service-available") return [this.services.available(heldService(rest[0]))]

        if (word === "service-wait-ready") return [await this.services.waitReady(heldService(rest[0]), rest[1])]

        if (word === "service-program-metadata") return [await this.serviceProgramMetadata(heldService(rest[0]))]

        if (word === "service-program-icon") return [await this.serviceProgramIcon(heldService(rest[0]), rest[1] as ProgramIconSize | undefined)]

        if (word === "service-follow") {

            const [subscription, address, scope, event] = rest

            if (typeof subscription !== "string" || !isServiceAddress(address)) return []

            if (scope !== "lifecycle" && scope !== "events") return []

            if (event !== null && typeof event !== "string") return []

            if (!this.grants(process.identity, "services", [address.process])) return []

            server.followService(this.services, subscription, address, scope, event, () => (
                this.processes.get(process.identity) === process
                && this.authManager.programManager.grantsPermission(process.program, "services", [address.process])
            ))

            return []
        }

        if (word === "service-unfollow") {

            server.unfollowService(String(rest[0]))

            return []
        }

        if (word === "service-send") {

            const [address, event, payload] = rest

            if (!isServiceAddress(address) || typeof event !== "string") return []

            const target = this.services.target(heldService(address))

            if (target) await this.publish(process.identity, "server", target.process.identity, target.endpoint, [event, payload])

            return []
        }

        if (word === "service-ask") {

            const [address, question, publicQuestion, event, payload] = rest

            if (!isServiceAddress(address) || address.endpoint !== "server" || typeof question !== "string" || typeof publicQuestion !== "string" || typeof event !== "string") {

                if (typeof question === "string") this.rejectQuestion(["wait", question, publicQuestion, event, payload], "A Server service question is invalid")

                return []
            }

            const target = this.services.target(heldService(address), "server")

            if (!target?.process.server) {

                this.rejectQuestion(["wait", question, publicQuestion, event, payload], "The Service is unavailable")

                return []
            }

            server.retain(question, () => target.process.server?.forget(question))

            this.asked(process.identity, "server", target.process.identity, [question, publicQuestion, event, payload])

            return []
        }

        // The one word here that answers about a process the host does
        // not know, because that absence is its whole subject. Every
        // other refuses it: for those there is nothing to answer about,
        // and whether an identity ever named anything is not something the
        // host tells. A *handle* is different — it could only have been
        // obtained for a process the host knew, so through one, absence
        // means ended and can mean nothing else.
        if (word === "exited") {

            if (!isHandleAddress(rest[0])) throw new Error("The boundary returned an invalid Process handle")

            return [this.processes.get(rest[0].identity)?.reference !== rest[0].reference]
        }

        // What a program may know about how it is shown. Not the whole
        // record: `depth` is how the host works out which window is at
        // the front of its layer — a mechanism, and a value a program
        // can read but never act on is a mechanism leaking through the
        // contract. What it is told instead is `front`, which is what
        // depth was being used to ask.
        if (word === "window") {

            const target = heldWindow(rest[0]).process

            return [this.system.windowSnapshot(target)]
        }

        if (word === "move") {

            const target = heldWindow(rest[0]).process

            await this.system.moveWindow(target, rest[1] as Position)

            return [target.identity]
        }

        if (word === "resize") {

            const target = heldWindow(rest[0]).process

            await this.system.resizeWindow(target, rest[1] as Size)

            return [target.identity]
        }

        if (word === "setGeometry") {

            const target = heldWindow(rest[0]).process

            await this.system.setWindowGeometry(target, rest[1] as WindowGeometry)

            return [target.identity]
        }

        if (word === "setTitle") {

            const target = heldWindow(rest[0]).process

            await this.system.setWindowTitle(target, String(rest[1] ?? ""))

            return [target.identity]
        }

        if (word === "setHeader") {

            const target = heldWindow(rest[0]).process

            await this.system.setWindowHeader(target, rest[1] as boolean)

            return [target.identity]
        }

        if (word === "raise") {

            const target = heldWindow(rest[0]).process

            await this.system.raiseWindow(target)

            return [target.identity]
        }

        if (word === "maximize") {

            const target = heldWindow(rest[0]).process
            await this.system.maximizeWindow(target, rest[1] !== false)
            return [target.identity]
        }

        if (word === "minimize") {

            const target = heldWindow(rest[0]).process

            await this.system.minimizeWindow(target, rest[1] !== false)

            return [target.identity]
        }

        if (word === "exit") {

            const target = heldProcess(rest[0])

            await this.system.exitProcess(target)

            return [target.identity]
        }

        if (word === "program-exit-processes") return [await this.system.exitProgramProcesses(heldProgram(rest[0]), process.identity)]

        if (word === "observe") {

            const kind = rest[3]

            const event = rest[4]

            const reportImpossible = rest[5] === true

            if (!isTrafficKind(kind)) return []

            if (event !== null && typeof event !== "string") return []

            const target = heldProcess(rest[1])

            this.observeServer(process, String(rest[0]), target, String(rest[2]), kind, event, reportImpossible)

            return []
        }

        if (word === "unobserve") {

            this.unobserveServer(process, String(rest[0]))

            return []
        }

        if (word === "follow") {

            const event = rest[3]

            if (event !== null && typeof event !== "string") return []

            const target = heldProcess(rest[1])

            this.followServer(process, String(rest[0]), target, String(rest[2]), event, rest[4] === true)

            return []
        }

        if (word === "unfollow") {

            this.unfollowServer(process, String(rest[0]))

            return []
        }

        if (word === "emit") {

            if (typeof rest[0] !== "string") return []

            await Promise.all([

                this.endpointEvents.emit(process.reference, "server", rest[0], rest[1]),

                this.services.emit(process, "server", rest[0], rest[1])
            ])

            return []
        }

        // Speaking into one end of another process's channel.
        //
        // Which end is said rather than implied. `publish` reached the
        // server end and only the server end, so a program with no
        // server half could not be spoken to at all — which was a
        // consequence of one hidden destination rather than a rule
        // anyone chose.
        //
        // The boundary derives the sender. Program code supplies only the
        // payload, so it cannot impersonate another Endpoint.
        if (word === "send") {

            const half = rest[1]

            if (half !== "server" && half !== "client") throw new Error(`A process has no "${String(half)}" end`)

            const target = heldProcess(rest[0])

            await this.publish(process.identity, "server", target.identity, half, rest.slice(2))

            return []
        }

        // Only into a server end, and refused here rather than merely
        // absent from a kit: a client side is not one thing, so there is
        // no answerer to name, and whoever was quickest is not an
        // answer.
        //
        // Forwarded, and that is all. The asker wrote its own address
        // into the question and holds its own deadline, so there is
        // nothing here to wait for and nothing to answer with. A caller
        // that stopped waiting will ignore what comes back, which is its
        // business and not this one's.
        if (word === "ask") {

            if (rest[1] !== "server") throw new Error("Only a server end can be asked — a client end has no one answerer")

            const question = String(rest[2])

            if (typeof rest[3] !== "string" || typeof rest[4] !== "string") throw new Error("A question needs a public id and an event name")

            const targetProcess = heldProcess(rest[0])

            const target = targetProcess.server

            if (!target) {

                this.rejectQuestion(["wait", question, rest[3], rest[4], ...rest.slice(5)], "This process has no live server endpoint")

                return []
            }

            server.retain(question, () => target.forget(question))

            this.asked(process.identity, "server", targetProcess.identity, rest.slice(2))

            return []
        }

        if (word === "fetch") {

            const description = rest[0] as { url?: unknown, method?: unknown, headers?: unknown, redirect?: unknown }

            if (!description || typeof description.url !== "string") throw new Error("A network request needs a URL")

            access.require("network", [description.url])

            const response = await fetch(description.url, {
                method: typeof description.method === "string" ? description.method : "GET",
                headers: Array.isArray(description.headers) ? description.headers as [string, string][] : undefined,
                redirect: description.redirect === "error" || description.redirect === "manual" ? description.redirect : "follow",
                body: rest[1] === null || rest[1] === undefined ? null : Buffer.from(byteValue(rest[1]))
            })

            return [{
                body: response.body ? new Uint8Array(await response.arrayBuffer()) : null,
                headers: [...response.headers.entries()],
                redirected: response.redirected,
                status: response.status,
                statusText: response.statusText,
                type: response.type,
                url: response.url
            }]
        }

        if (word === "websocket-open") {

            const identity = String(rest[0])
            const url = String(rest[1])
            const protocols = rest[2]

            access.require("network", [url])

            if (!identity) throw new Error("A WebSocket needs an identity")
            if (protocols !== undefined && typeof protocols !== "string" && (!Array.isArray(protocols) || protocols.some(value => typeof value !== "string"))) {
                throw new Error("WebSocket protocols must be text")
            }

            const sockets = this.serverSockets.get(server) ?? new Map<string, WebSocket>()
            if (sockets.has(identity)) throw new Error("The WebSocket identity already exists")
            this.serverSockets.set(server, sockets)

            const socket = new WebSocket(url, protocols as string | string[] | undefined)
            sockets.set(identity, socket)
            const release = server.retainResource(() => {
                sockets.delete(identity)
                socket.close()
            })

            socket.on("message", (data, binary) => {
                const value = binary ? Uint8Array.from(data as Buffer) : String(data)
                server.deliver("host-websocket", identity, "message", value).catch(() => undefined)
            })
            socket.on("error", () => server.deliver("host-websocket", identity, "error").catch(() => undefined))
            socket.on("close", (code, reason) => {
                release()
                server.deliver("host-websocket", identity, "close", { code, reason: reason.toString(), wasClean: true }).catch(() => undefined)
            })

            await new Promise<void>((resolve, reject) => {
                socket.once("open", resolve)
                socket.once("error", reject)
            })

            return [{ extensions: socket.extensions, protocol: socket.protocol }]
        }

        if (word === "websocket-send" || word === "websocket-close") {

            const socket = this.serverSockets.get(server)?.get(String(rest[0]))
            if (!socket) throw new Error("The WebSocket does not exist")

            if (word === "websocket-send") socket.send(typeof rest[1] === "string" ? rest[1] : byteValue(rest[1]))
            else socket.close(typeof rest[1] === "number" ? rest[1] : undefined, typeof rest[2] === "string" ? rest[2] : undefined)

            return []
        }

        // Program-owned storage uses the same System operation vocabulary in
        // every execution environment. The runtime never receives a native
        // filesystem capability.
        if (word === "data" || word === "cache") {

            // The one registry is the authority for every program,
            // installed or not. Naming the current program explicitly
            // must therefore be equivalent to leaving the subject empty.
            const program = heldProgram(rest[0])

            return [this.system.programArea(program, word, String(rest[1]), rest.slice(2))]
        }

        // Native storage remains a System capability even when the selected
        // runtime could reach the host directly by another route.
        if (word === "host-storage") {

            const operation = String(rest[0])
            const joins = stringPath(rest[1])
            const path = this.system.nativeStorage("path", joins) as string
            const required = operation === "delete-storage" || operation === "delete-file" || operation === "clear"
                ? "delete"
                : operation === "create" ? "write" : "read"

            access.requireStorage(path, required)

            return [this.system.nativeStorage(operation, joins, rest[2])]
        }

        // What a program has said, asked for and never told. The
        // connection behind this is read-only, so a query that tries to
        // change what it reads is refused by the database rather than by
        // anything here deciding what a query means.
        if (word === "logs") {

            const program = heldProgram(rest[0])

            return [this.system.programQuery(program, "logs", String(rest[1]), Array.isArray(rest[2]) ? rest[2] : [])]
        }

        if (word === "system-logs") {

            access.require("logs", [])

            return [this.authManager.linkManager.application.logs.query(String(rest[0]), Array.isArray(rest[1]) ? rest[1] : [])]
        }

        // A program's own database. Written as well as read, unlike the
        // log above: that is the system's account of a program and this
        // is the program's own, which is why they are two files.
        if (word === "database") {

            const program = heldProgram(rest[0])

            return [this.system.programQuery(program, "database", String(rest[1]), Array.isArray(rest[2]) ? rest[2] : [])]
        }

        if (word === "uploads") {

            const { uploads } = this.system

            if (rest[0] === "path") {

                access.requireStorage(uploads.fileManager.path)

                return [uploads.fileManager.path]
            }
            if (rest[0] === "stat") return [uploads.stat(String(rest[1]))]

            if (rest[0] === "write") {

                access.require("uploads", [])

                const bytes = byteValue(rest[1])

                const description = rest[2] as { extension?: unknown } | null

                if (!description || typeof description.extension !== "string") throw new Error("Uploads write takes a value description")

                const file = await uploads.write(description.extension, byteStream(bytes))

                const stat = uploads.stat(file)

                if (!stat) throw new Error("The completed upload could not be described")

                return [{ file, ...stat }]
            }

            throw new Error(`The uploads capability does not know the operation "${String(rest[0])}"`)
        }

        // A program's own persistent key-value store. A Program handle names
        // whose; an omitted subject means the asking process's program. The
        // application store has no generic host road — application methods
        // expose only the values the application actually owns.
        if (word === "store") {

            const [operation, key, value, ttl] = rest.slice(1) as [string, string, unknown, number | undefined]

            const whose = heldProgram(rest[0])

            return [await this.system.programStore(whose, operation, key, value, ttl)]
        }

        throw new Error(`The host does not know the word "${String(word)}"`)
    }

    private async endHostWait(process: Process, server: ServerProcessBoundary, question: string, args: unknown[]) {

        try {

            if (args[0] === "wait-ready") {

                const access = new SystemAccess(this, process)

                const target = access.process(this.system.holdProcess(args[1], process))

                const endpoint = args[2]

                if (endpoint !== "server" && endpoint !== "client") throw new Error("Readiness needs an Endpoint")

                const requireCurrentIncarnation = args[3] === true

                if (!target.program[endpoint]) throw new Error(`This program declared no ${endpoint} Endpoint`)

                if (requireCurrentIncarnation && !target[endpoint]) throw new Error(`This process has no live ${endpoint} Endpoint`)

                if (endpoint === "server" ? target.server?.ready : target.client) {

                    this.say(server, "host-end", "answer", question, succeeded([]))

                    return
                }

                let active = true

                const incarnation = requireCurrentIncarnation ? target[endpoint] : null

                let stopReady: () => void = () => undefined
                let stopExit: () => void = () => undefined
                let stopEndpoint: () => void = () => undefined

                const finish = (outcome?: RequestOutcome<unknown[]>) => {

                    if (!active) return

                    active = false

                    stopReady()

                    stopExit()

                    stopEndpoint()

                    if (outcome) this.say(server, "host-end", "answer", question, outcome)
                }

                stopReady = target.waitReady(endpoint, () => finish(succeeded([])))

                // waitReady may answer synchronously.
                if (!active) {

                    stopReady()

                    return
                }

                stopExit = target.onExit(() => finish(failed(new Error(`The process ended before its ${endpoint} Endpoint became ready`))))

                // onExit may answer synchronously for an already-ending target.
                if (!active) {

                    stopExit()

                    return
                }

                if (incarnation) {

                    const stopped = () => finish(failed(new Error(`The ${endpoint} Endpoint stopped before becoming ready`)))

                    stopEndpoint = endpoint === "server"
                        ? target.onServerStop(stopped)
                        : target.onClientStop(stopped)

                    if (target[endpoint] !== incarnation) stopped()
                }

                server.retain(question, () => finish())

                return
            }

            // The host's words answer with a list — one item each — and a
            // wire carries one value, so the list is that value. A
            // program's own endpoint answers a value directly; these are
            // the two shapes and they meet here.
            const result = await this.endHost(process, server, args)

            this.say(server, "host-end", "answer", question, succeeded(result))
        }

        catch (exception) {

            this.say(server, "host-end", "answer", question, failed(exception))
        }
    }

    private async endHostStream(process: Process, server: ServerProcessBoundary, question: string, args: unknown[]) {

        let active = true
        let cancel = () => { active = false }
        server.retain(question, () => cancel())

        await this.say(server, "host-end", "stream", question, "open")

        try {

            const operation = args[0]

            const access = new SystemAccess(this, process)

            if (operation === "shell") {

                access.requireAll()

                const controller = new AbortController()

                cancel = () => { active = false; controller.abort(new Error("The shell command was cancelled")) }

                for await (const event of this.system.shell(String(args[1]), { ...(args[2] as object), signal: controller.signal })) {

                    if (!active) return

                    await this.say(server, "host-end", "stream", question, "data", event)
                }

                if (active) await this.say(server, "host-end", "stream", question, "answer", succeeded(undefined))

                return
            }

            if (operation === "uploads-stream") {

                const file = String(args[1])

                if (!isUploadFile(file)) throw new Error("That is not an upload file")

                for await (const chunk of this.system.uploads.stream(file)) {

                    if (!active) return

                    await this.say(server, "host-end", "stream", question, "data", Uint8Array.from(chunk))
                }

                if (active) await this.say(server, "host-end", "stream", question, "answer", succeeded(undefined))

                return
            }

            if (operation === "storage-content") {

                const scope = args[1]

                const program = scope === "program" ? access.program(this.system.holdProgram(args[2], process.program)) : null

                const area = scope === "program" && (args[3] === "data" || args[3] === "cache") ? args[3] : null

                const action = String(args[scope === "program" ? 4 : 2])

                const joins = stringPath(args[scope === "program" ? 5 : 3])

                const value = args[scope === "program" ? 6 : 4]

                const input = args[scope === "program" ? 7 : 5] as { offset?: number, length?: number, overwrite?: boolean } | undefined

                if (scope !== "program" && scope !== "system") throw new Error("Storage content needs a scope")

                if (scope === "program" && !area) throw new Error("Program storage needs an area")

                if (scope === "system") {

                    const path = this.system.nativeStorage("path", joins) as string

                    access.requireStorage(path, action === "stream" ? "read" : "write")
                }

                if (action === "stream") {

                    const stream = program
                        ? this.authManager.programManager.streamArea(program, area!, joins, [input?.offset, input?.length])
                        : this.system.nativeStorageStream(joins, input)

                    for await (const chunk of stream) {

                        if (!active) return

                        await this.say(server, "host-end", "stream", question, "data", Uint8Array.from(chunk))
                    }
                }

                else {

                    const bytes = byteStream(byteValue(value))

                    if (action === "write") {

                        if (program) await this.authManager.programManager.writeArea(program, area!, joins, bytes, undefined, input?.overwrite !== false)

                        else await this.system.nativeStorageWrite(joins, bytes, input?.overwrite !== false)
                    }

                    else if (action === "append") {

                        if (program) await this.authManager.programManager.appendArea(program, area!, joins, bytes)

                        else await this.system.nativeStorageAppend(joins, bytes)
                    }

                    else throw new Error(`The host does not know the Storage content operation "${action}"`)
                }

                if (active) await this.say(server, "host-end", "stream", question, "answer", succeeded(undefined))

                return
            }

            if (operation === "storage-watch") {

                const scope = args[1]

                const controller = new AbortController()

                cancel = () => { active = false; controller.abort(new Error("The Storage watch was cancelled")) }

                let changes: AsyncIterable<{ event: "rename" | "change", path: string | null }>

                if (scope === "program") {

                    const program = access.program(this.system.holdProgram(args[2], process.program))

                    if (args[3] !== "data" && args[3] !== "cache") throw new Error("Program storage needs an area")

                    const options = args[5] as { recursive?: boolean } | undefined

                    changes = this.authManager.programManager.watchArea(program, args[3], stringPath(args[4]), options?.recursive === true, controller.signal)
                }

                else if (scope === "system") {

                    const joins = stringPath(args[2])

                    const path = this.system.nativeStorage("path", joins) as string

                    access.requireStorage(path, "read")

                    const options = args[3] as { recursive?: boolean } | undefined

                    changes = this.system.nativeStorageWatch(joins, options?.recursive === true, controller.signal)
                }

                else throw new Error("Storage watch needs a scope")

                for await (const change of changes) {

                    if (!active) return

                    await this.say(server, "host-end", "stream", question, "data", change)
                }

                if (active) await this.say(server, "host-end", "stream", question, "answer", succeeded(undefined))

                return
            }

            const program = access.program(this.system.holdProgram(args[1]))

            if (operation === "run") {

                let running: Process | null = null
                let settled = false
                let finish!: () => void
                const completion = new Promise<void>(resolve => { finish = resolve })
                let sending = Promise.resolve()
                const emit = (value: unknown) => {

                    if (!active) return

                    sending = sending.then(() => this.say(server, "host-end", "stream", question, "data", value))
                }

                cancel = () => {

                    active = false

                    if (running) this.system.exitProcess(running).catch(() => undefined)
                }

                const identity = await this.system.runProcess(program, access.launch(args[2]), {
                    started: created => {

                        running = created
                        emit({ event: "started", process: processReference(created) })
                    },
                    output: (stream, text) => emit({ event: "output", stream: stream === "err" ? "stderr" : "stdout", text }),
                    exited: (code, signal) => {

                        if (settled) return

                        settled = true
                        emit({
                            event: "exited",
                            process: running && processReference(running),
                            exit: { status: signal ? "signaled" : "exited", code, signal }
                        })
                        finish()
                    }
                }, process)

                if (!active) await this.system.exitProcess(this.system.requireProcess(identity))

                await completion
                await sending

                if (active) await this.say(server, "host-end", "stream", question, "answer", succeeded(undefined))

                return
            }

            const stream = operation === "install"
                ? this.system.installProgram(program, parseProgramInstallOptions(args[2] ?? {}), process.identity)
                : operation === "uninstall"
                    ? this.system.uninstallProgram(program, parseProgramUninstallOptions(args[2] ?? {}), process.identity)
                    : null

            if (!stream) throw new Error(`The host does not know the stream operation "${String(operation)}"`)

            for await (const chunk of stream) {

                if (!active) return

                await this.say(server, "host-end", "stream", question, "data", chunk)
            }

            if (active) await this.say(server, "host-end", "stream", question, "answer", succeeded(undefined))
        }

        catch (exception) {

            if (active) await this.say(server, "host-end", "stream", question, "answer", failed(exception))
        }
    }

    // A client question retains its cancellation at the server-host
    // counterpart of that exact desktop boundary. Replacing the document or
    // losing the session therefore removes the target's queued request even
    // when the desktop can no longer send an explicit cancellation.
    @Subscribe("/frame/ask")
    protected askClientFrame(source: string, identity: string, values: unknown[]) {

        const connection = this.authManager.connection()

        const question = String(values[0])

        if (!this.retainClientQuestion(connection, source, question, identity)) {

            this.rejectClientQuestion(connection, source, ["wait", ...values], "This process has no live server endpoint")

            return
        }

        this.asked(source, "client", identity, values)
    }

    @Subscribe("/frame/service/ask")
    protected askClientService(source: string, address: unknown, values: unknown[]) {

        const connection = this.authManager.connection()

        if (!isServiceAddress(address) || address.endpoint !== "server" || typeof values[0] !== "string" || typeof values[1] !== "string" || typeof values[2] !== "string") {

            this.rejectClientQuestion(connection, source, ["wait", ...values], "A Server service question is invalid")

            return
        }

        const target = this.services.target(address, "server")

        if (!target || !this.retainClientQuestion(connection, source, values[0], target.process.identity)) {

            this.rejectClientQuestion(connection, source, ["wait", ...values], "The Service is unavailable")

            return
        }

        this.asked(source, "client", target.process.identity, values)
    }

    @Subscribe("/frame/cancel")
    protected cancelClientFrame(source: string, question: string) {

        this.clientForwarders.get(this.clientOwnerKey(this.authManager.connection(), source))?.cancel(question)
    }

    // Where both roads meet: a question named by whoever is waiting for
    // it, put into the server half's hands.
    private asked(source: string, sourceHalf: Half, identity: string, values: unknown[]) {

        if (typeof values[0] !== "string" || typeof values[1] !== "string" || typeof values[2] !== "string") return

        const sourceProcess = this.processes.get(source)

        const targetProcess = this.processes.get(identity)

        if (!sourceProcess || !targetProcess?.server) {

            this.rejectQuestion(["wait", ...values], "This process has no live server endpoint")

            return
        }

        const payload = values[3]

        const received = { from: endpointReference(sourceProcess, sourceHalf), payload }

        this.traffic.emit(sourceProcess.reference, sourceHalf, "ask", values[2], values[1], {

            to: endpointReference(targetProcess, "server"),

            payload
        }).catch(() => undefined)

        this.deliver(identity, "server", ["wait", values[0], values[1], values[2], received]).catch(() => undefined)
    }

    @Subscribe("/frame/end-end")
    protected async endEndClientFrame(identity: string, values: unknown[]) {

        const connection = this.authManager.connection()

        // The payload crosses The Link once as its native event tuple. The
        // route still supplies the speaker; no nested wire format is needed.
        if (!Array.isArray(values)) return

        if (values[0] === "wait" && typeof values[1] === "string" && !this.retainClientQuestion(connection, identity, values[1], identity)) {

            this.rejectClientQuestion(connection, identity, values, "This process has no live server endpoint")

            return
        }

        if (values[0] === "wait") {

            this.asked(identity, "client", identity, values.slice(1))

            return
        }

        await this.publish(identity, "client", identity, "server", values)
    }

    @Subscribe("/exit")
    public async exit(identity: string) {

        return await this.exitProcess(identity)
    }

    @Subscribe("/parent")
    protected async parent(value: unknown) {

        const process = this.system.holdProcess(value)

        return process.parent ? processReference(process.parent) : null
    }

    @Subscribe("/endpoint/start")
    protected async startEndpoint(identity: string, which: string, launch?: ServerLaunch | ClientLaunch) {

        if (which === "server") return await this.startServer(identity, launch as ServerLaunch | undefined)

        if (which === "client") return await this.startClient(identity, launch as ClientLaunch | undefined)

        throw new Error("A Process endpoint is server or client")
    }

    @Subscribe("/endpoint/stop")
    protected async stopEndpoint(identity: string, which: string) {

        if (which === "server") return await this.stopServer(identity)

        if (which === "client") return await this.stopClient(identity)

        throw new Error("A Process endpoint is server or client")
    }

    // Geometry, said as it changes — and only geometry.
    //
    // It also announced a `maximize` when a move happened to land on the
    // whole surface. Filling the surface is not a state any more: it is
    // a size like any other, and the button that asks for it lives in
    // the window manager with a memory of its own. So a move is a move.
    //
    // Minimized is untouched by both. Where a window is and whether it
    // is shown are two questions, so a hidden window can be moved and
    // resized and will appear where it now is.
    @Subscribe("/move")
    public async move(identity: string, position: Position) {

        const window = this.mutableWindowOf(identity)

        if (!window.move(position)) return { identity, window }

        this.said(identity, "move", window.position)

        return await this.publishWindowChange("/move", identity, window)
    }

    @Subscribe("/resize")
    public async resize(identity: string, size: Size) {

        const window = this.mutableWindowOf(identity)

        if (!window.resize(size)) return { identity, window }

        this.said(identity, "resize", window.size)

        return await this.publishWindowChange("/resize", identity, window)
    }

    @Subscribe("/set-geometry")
    public async setGeometry(identity: string, geometry: WindowGeometry) {

        const window = this.mutableWindowOf(identity)

        const changed = window.setGeometry(geometry)

        if (!changed.moved && !changed.resized) return { identity, window }

        if (changed.moved) this.said(identity, "move", window.position)

        if (changed.resized) this.said(identity, "resize", window.size)

        return await this.publishWindowChange("/set-geometry", identity, window)
    }

    @Subscribe("/set-title")
    public async setTitle(identity: string, title: string) {

        const window = this.mutableWindowOf(identity)

        if (!window.setTitle(title)) return { identity, window }

        this.said(identity, "changeTitle", window.title)

        return await this.publishWindowChange("/change-title", identity, window)
    }

    @Subscribe("/set-header")
    public async setHeader(identity: string, header: boolean) {

        const window = this.mutableWindowOf(identity)

        if (!window.setHeader(header)) return { identity, window }

        this.said(identity, "changeHeader", window.header)

        return await this.publishWindowChange("/change-header", identity, window)
    }

    // To the front of its own layer, and that is the whole of it.
    //
    // It was called `focus` and it did three things: it showed a hidden
    // window, it reordered, and its name claimed the keyboard. Now it
    // reorders. A hidden window raised stays hidden and appears at its
    // new place in the order when it is shown; a taskbar click that
    // wants both says both, which is the window manager composing
    // primitives rather than one primitive doing two jobs.
    //
    // And the name matters beyond tidiness. **No word here may take real
    // input focus**, or a program could pull typing away from the
    // program a person believes they are typing into. Keyboard focus is
    // the browser's, reached by a person clicking and no other way, so
    // the system's word for ordering must not be called focus.
    @Subscribe("/raise")
    public async raise(identity: string) {

        const window = this.mutableWindowOf(identity)

        const front = this.front(window.layer)

        if (front === identity) return { identity, window }

        window.depth = ++this.highest

        this.settleFront(window.layer, front)

        return await this.publishWindowChange("/raise", identity, window)
    }

    // Shown, or not shown. Nothing else: the order is untouched, so a
    // window hidden and shown again comes back exactly where it was in
    // its layer rather than on top of it.
    @Subscribe("/maximize")
    public async maximize(identity: string, maximized: boolean) {

        if (typeof maximized !== "boolean") throw new Error("Window maximize takes a boolean state")
        const window = this.mutableWindowOf(identity)
        if (window.maximized === maximized) return { identity, window }
        window.maximized = maximized
        this.said(identity, "maximize", maximized)
        return await this.publishWindowChange("/maximize", identity, window)
    }

    @Subscribe("/minimize")
    public async minimize(identity: string, minimized: boolean) {

        if (typeof minimized !== "boolean") throw new Error("Window minimize takes a boolean state")
        const window = this.mutableWindowOf(identity)

        if (window.minimized === minimized) return { identity, window }

        const front = this.front(window.layer)

        window.minimized = minimized

        this.said(identity, "minimize", window.minimized)

        this.settleFront(window.layer, front)

        return await this.publishWindowChange("/minimize", identity, window)
    }

    // RPC results answer only their caller. A Window transition is separate
    // shared state and is published explicitly, once, only after it changed.
    private async publishWindowChange(event: string, identity: string, window: Window) {

        const payload = { identity, window }

        await this.$outbound.publish(event, payload)

        return payload
    }

    // ── The front window of a layer ──────────────────────────────────
    //
    // Which window is at the front is a fact about one *layer* at a
    // time: the shown one in that layer with the greatest depth.
    // Nothing stores it, so nothing can hold a stale copy — and
    // everything that could move it (raising, hiding, showing, a window
    // opening, a process ending) reads it before and settles it after,
    // rather than each announcing what it guessed.
    //
    // Three layers, so up to three front windows, and what happens in
    // one is not news in another: a window opening in `over` does not
    // reorder anything a person is typing in.
    //
    // **Not the keyboard.** A browser focuses one element and the keys
    // go where a person typed. This is ordering, and calling it focus
    // was a claim the system cannot back — and must not, since a
    // program able to take real focus could read typing meant for
    // another.
    //
    // The order includes hidden windows; this reads only the shown ones.
    // A minimized window has a place in the order and is not at the
    // front of anything, which is why raising one changes where it will
    // appear rather than whether it appears.
    public front(layer: WindowLayer) {

        let best: string | null = null

        let depth = -Infinity

        for (const [identity, process] of this.processes) {

            const window = process.clientEndpoint?.window

            if (!process.client || !window || window.minimized || window.layer !== layer) continue

            if (window.depth <= depth) continue

            best = identity

            depth = window.depth
        }

        return best
    }

    // Said only where it changed: two windows at most, and neither hears
    // news about the other — the one that lost it and the one that took
    // it, each told about itself.
    //
    // Settled within one layer, because that is the only layer the
    // change could have reached.
    public settleFront(layer: WindowLayer, was: string | null) {

        const now = this.front(layer)

        if (now === was) return

        if (was) this.said(was, "front", false)

        if (now) this.said(now, "front", true)
    }

    public toJSON() {

        return {

            processes: [...this.processes].map(([identity, process]) => [identity, process.hosted()] as [string, HostedProcess])
        }
    }
}

interface ProcessRegistration {

    /** Client Endpoint-owned Window created even when its execution context starts stopped. */
    window?: Shape | null

    /** Attach observers before either Endpoint can emit output or exit. */
    prepare?: (process: Process) => void

    /** Report creation only after the authoritative Process snapshot is published. */
    created?: (process: Process) => void
}

// Where an answer goes, read out of the question itself.
//
// A question is named by its asker before it leaves — which half of
// which process is holding the promise — so routing an answer needs no
// memory at all. The address is in the message, which is the one place
// it cannot go stale, and the only place that does not require the
// middle to be trusted.
function addressed(question: string): { half: Half | "outside", identity: string } | null {

    const [half, identity] = question.split(":")

    if (half !== "server" && half !== "client" && half !== "outside") return null

    return { half, identity }
}

function isTrafficKind(value: unknown): value is TrafficKind {

    return value === "publish" || value === "ask" || value === "answer"
}

function half(value: unknown): Half {

    if (value === "server" || value === "client") return value

    throw new Error("An Endpoint observation targets server or client")
}

function trafficKind(value: unknown): TrafficKind {

    if (isTrafficKind(value)) return value

    throw new Error("A traffic observation kind is publish, ask, or answer")
}

function invalid(message: string): never {

    throw new Error(message)
}

interface HandleAddress {

    identity: string

    reference: string
}

function isHandleAddress(value: unknown): value is HandleAddress {

    return typeof value === "object" && value !== null && "identity" in value && "reference" in value
        && typeof value.identity === "string" && typeof value.reference === "string"
}

function unexpectedServerEndpointExitContent(process: Process, code: number | null, signal: NodeJS.Signals | null) {

    const endpoint = process.name ? `the “${process.name}” Process's server Endpoint` : "its server Endpoint"

    if (signal) return `${process.program.name} stopped unexpectedly because ${endpoint} was terminated by ${signal}.`

    if (code !== null) return `${process.program.name} stopped unexpectedly because ${endpoint} exited with code ${code}.`

    return `${process.program.name} stopped because ${endpoint} ended unexpectedly.`
}

function stringPath(value: unknown) {

    if (!Array.isArray(value) || value.some(part => typeof part !== "string")) throw new Error("A Storage path is a list of names")

    return value as string[]
}

function byteValue(value: unknown) {

    if (value instanceof Uint8Array) return value

    if (value instanceof ArrayBuffer) return new Uint8Array(value)

    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)

    if (Array.isArray(value) && value.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) return Uint8Array.from(value)

    throw new Error("The operation requires bytes")
}

function byteStream(value: Uint8Array) {

    return new ReadableStream<Uint8Array>({

        start(controller) {

            controller.enqueue(value)

            controller.close()
        }
    })
}

type Completion = () => unknown | PromiseLike<unknown>

/** Run every teardown step, preserving all failures until cleanup is complete. */
async function settleEvery(steps: Completion[]) {

    const failures: unknown[] = []

    for (const step of steps) {

        try { await step() }

        catch (error) { failures.push(error) }
    }

    return failures
}

async function completeEvery(message: string, steps: Completion[]) {

    throwFailures(message, await settleEvery(steps))
}

function throwFailures(message: string, failures: unknown[]): void {

    if (failures.length === 1) throw failures[0]

    if (failures.length > 1) throw new AggregateError(failures, message)
}

// What a launch resolved to, before a window exists to hold it.
//
// Handed to `register` rather than worked out there: the declaration and
// what the launch overrode are reconciled in one place, by whoever is
// starting the process, so there are not two places deciding what a
// window opens as.
interface ShapeBase {

    title: string

    header: boolean

    position: Position

    size: Size

    minimize: boolean

    maximize: boolean
}

export interface StandardShape extends ShapeBase {

    layer: Layer
}

export type Shape = StandardShape

type EndpointEvent = "endpointStart" | "endpointStop"

export type ProcessManagerSnapshot = {

    processes: [string, ProcessSnapshot][]
}

// Inside, or not at all. A program joining its own paths from the root
// gives that up knowingly; a join asked of the host does not.
