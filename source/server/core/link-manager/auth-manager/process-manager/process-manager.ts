import { Connect, Subscribe } from "@libs/the-link/decorators/escript"
import { serveLimit } from "@server/core/served-file-manager"
import { ChildProcess } from "node:child_process"
import { type Launch, type LaunchClient, type Options } from "../program-manager/program-manager"
import Program from "../program-manager/program"
import { Layer } from "../program-manager/config"
import Window, { Position, Size } from "./window"
import TheLink from "@libs/the-link/the-link"
import { Transmitted } from "@libs/superjson"
import AuthManager from "../auth-manager"
import { signalProcessTree } from "@libs/process-tree"
import Process, { type HostedProcess } from "./process"
import ServerProcessBoundary from "./server-process-boundary"
import ProcessTraffic, { type Half, type TrafficKind } from "./process-traffic"
import ClientProcessForwarder from "./client-process-forwarder"
import HostTraffic from "./host-traffic"
import { failed, succeeded, type Outcome } from "@server/core/outcome"
import { endpointReference, processReference } from "./endpoint-reference"
import EndpointEvents from "./endpoint-events"
import { isPermissionName, type PermissionName, type WindowLayer } from "@phreshos/core"

/**
 * The core's processes: the wire and the collection. Each process owns
 * itself — its endpoint incarnations and serialisation — and this manager
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

    // Host facts use their own the-link routes. A server boundary joins only
    // the event and subject routes its endpoint explicitly requested.
    private readonly hostTraffic = new HostTraffic()

    // The remote half of each desktop boundary lease. It owns only that
    // document's forwarding interests and disappears with the lease.
    private readonly clientForwarders = new Map<string, ClientProcessForwarder>()

    // Endpoint transitions for one Process are serialized. State is changed in
    // one place, so two simultaneous stop requests cannot both believe the
    // other endpoint will preserve the Process lifetime.
    private readonly transitions = new Map<string, Promise<void>>()

    private readonly stoppingServers = new Set<ServerProcessBoundary>()

    private highest = 0

    // Questions name their waiting endpoint in their correlation address.
    // The host reads that address only to route the answer. The source Process
    // boundary retains the cancellation forwarding for its lifetime, but no
    // host owns the Promise, timer, callback, or result.
    public constructor(authManager: AuthManager) {

        super()

        this.authManager = authManager

        this.connectTo(this.authManager, "/process")

    }

    private find(identity: string) {

        const process = this.processes.get(identity)

        if (!process) throw new Error("The host does not know this process")

        return process
    }

    /** Resolve an SDK handle without ever letting an old handle retarget a replacement. */
    private heldProcess(value: unknown, fallback?: Process) {

        if (value === undefined || value === null) {

            if (fallback) return fallback

            throw new Error("A Process handle is required")
        }

        if (!isHandleAddress(value)) throw new Error("The boundary returned an invalid Process handle")

        const process = this.processes.get(value.identity)

        if (!process || process.reference !== value.reference) throw new Error("The Process represented by this handle does not exist")

        return process
    }

    /** Resolve the exact runtime Program entity addressed by an SDK handle. */
    private heldProgram(value: unknown, fallback?: Program) {

        if (value === undefined || value === null) {

            if (fallback) return fallback

            throw new Error("A Program handle is required")
        }

        if (!isHandleAddress(value)) throw new Error("The boundary returned an invalid Program handle")

        const program = this.authManager.programManager.reach(value.identity)

        if (!program || program.reference !== value.reference) throw new Error("The Program represented by this handle does not exist")

        return program
    }

    private heldWindow(value: unknown, fallback: Process) {

        const process = this.heldProcess(value, fallback)

        const window = process.client?.window

        if (!window) throw new Error("This process has no live client endpoint")

        return { process, window }
    }

    private windowOf(identity: string) {

        const window = this.find(identity).client?.window

        if (!window) throw new Error("This process has no live client endpoint")

        return window
    }

    private mutableWindowOf(identity: string) {

        const window = this.windowOf(identity)

        if (window.layer === "wallpaper") throw new Error("A wallpaper Window is managed by the system")

        return window
    }

    private surfaceWindowOf(identity: string) {

        const window = this.windowOf(identity)

        if (window.layer === "window") throw new Error("A window-layer Window cannot own a Surface")

        if (window.layer === "wallpaper") throw new Error("A wallpaper-layer Window cannot own a Surface")

        return window
    }

    // A server runtime is a ProcessLink. Speaking through its outbound
    // tunnel keeps IPC as a transport detail and leaves a stopped child as
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

        if (!this.authManager.linkManager.connections.has(connection) || !this.processes.get(pane)?.client) return

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

            observed = this.heldProcess(target)

            if (observed.program !== this.find(pane).program) throw new Error("The desktop does not know this process")
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

    /** Remove foreign Endpoint identities before observed traffic reaches a Client boundary. */
    private clientVisibleTraffic(pane: string, values: unknown[]) {

        const viewer = this.processes.get(pane)

        const index = values.length - 1

        const message = values[index]

        if (!viewer || index < 0 || typeof message !== "object" || message === null || !("to" in message)) return values

        const to = message.to

        if (typeof to !== "object" || to === null || !("process" in to)) return values

        const reference = to as ReturnType<typeof endpointReference>

        if (reference.process.program.identity === viewer.program.identity) return values

        const masked = [...values]

        masked[index] = { ...message, to: null }

        return masked
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

            observed = this.heldProcess(target)

            if (observed.program !== this.find(pane).program) throw new Error("The desktop does not know this process")
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

        this.authManager.publishToConnection(connection, "/process/end-end", pane, JSON.stringify(answer)).catch(() => undefined)
    }

    public releaseConnection(connection: string) {

        for (const [key, boundary] of this.clientForwarders) {

            if (!key.startsWith(`${connection}:`)) continue

            boundary.release()

            this.clientForwarders.delete(key)
        }
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

            from: targetHalf === "client" && sourceProcess.program !== targetProcess.program
                ? null
                : endpointReference(sourceProcess, sourceHalf),

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

        const process = this.processes.get(back.identity)

        const outcome = values[4] as Outcome

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

    private transition(process: Process, change: () => Promise<void> | void) {

        const before = this.transitions.get(process.identity) ?? Promise.resolve()

        const next = before.catch(() => undefined).then(async () => {

            if (this.processes.get(process.identity) !== process) throw new Error("The process no longer exists")

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

                if (values[0] === "wait" && typeof values[1] === "string") {

                    this.endHostWait(process, values[1], values.slice(2)).catch(() => undefined)

                    return
                }

                this.endHost(process, values).catch(() => undefined)
            }
        })

        server.$inbound.subscribe("boundary-ready", (ready: unknown) => {

            if (ready !== true || process.server !== server) return

            process.serverBecameReady(server)

            this.$outbound.publish("/server-ready", process.identity).catch(() => undefined)
        })
    }

    private async endpointEvent(event: EndpointEvent, process: Process, endpoint: "server" | "client") {

        const record = processReference(process)

        await Promise.all([

            this.announce(event, process.program.identity, process.program.reference, record, endpoint),

            this.hostTraffic.emitSubject(event, process.reference, record, endpoint)
        ])
    }

    private async serverStarted(process: Process) {

        await this.$outbound.publish("/server-start", process.identity, process.hosted())

        // Readiness can arrive while the start announcement is crossing to
        // the desktop. Repeating the current fact after that awaited crossing
        // guarantees the desktop never applies ready before it knows the new
        // incarnation exists.
        if (process.server?.ready) await this.$outbound.publish("/server-ready", process.identity)

        await this.endpointEvent("endpointStart", process, "server")
    }

    private async serverEnded(process: Process, boundary: ServerProcessBoundary, code: number | null, signal: NodeJS.Signals | null) {

        const explicitlyStopped = this.stoppingServers.delete(boundary)

        const finish = async () => {

            if (!process.serverStopped(boundary, code, signal)) return

            boundary.release()

            await this.$outbound.publish("/server-stop", process.identity, process.hosted(), code, signal)

            await this.endpointEvent("endpointStop", process, "server")

            // A server crash invalidates the complete execution. Only the
            // explicit server.stop() road may intentionally leave the client
            // state alive without its server counterpart.
            if (!explicitlyStopped) {

                await this.authManager.linkManager.application.dialogManager.serverCrashed(process, code, signal)

                if (process.client) await this.deactivateClient(process)
            }

            if (!process.live) await this.remove(process.identity, code, signal)
        }

        if (explicitlyStopped) await finish()

        else await this.transition(process, finish).catch(() => undefined)
    }

    private activateServer(process: Process, child: ChildProcess) {

        const server = process.startServer(child,

            (boundary, code, signal) => this.serverEnded(process, boundary, code, signal),

            (values, reason) => this.rejectQuestion(values, reason),

            this.authManager.linkManager.theme.tunnel
        )

        this.bindServer(process, server)

        return server
    }

    private window(program: Program, shape: Shape) {

        const shown = { title: shape.title, url: program.clientRoot, layer: shape.layer, location: shape.location }

        return new Window(shown, shape.position, shape.size, ++this.highest, shape.minimize)
    }

    public async register(identity: string, name: string | null, program: Program, options: Options, child: ChildProcess | null, client: boolean, shape: Shape | null, parent: Process | null, configure?: (process: Process) => void) {

        if (this.processes.has(identity)) {

            if (child) signalProcessTree(child, "SIGKILL")

            throw new Error("The host already knows this process identity")
        }

        if (name !== null && [...this.processes.values()].some(process => process.program === program && process.name === name)) {

            if (child) signalProcessTree(child, "SIGKILL")

            throw new Error("This program already has a process with that name")
        }

        // Who had focus before this one opened, in the layer it is
        // opening into. A window is born on top of its own layer and
        // takes focus from whoever held it there; the other two layers
        // do not hear about it.
        const front = shape && this.front(shape.layer)

        const window = shape ? this.window(program, shape) : null

        const process = new Process(identity, name, program, options, parent, this.hostTraffic)

        this.processes.set(identity, process)

        process.ownExit(() => this.exitProcess(identity))

        process.onExit((code, signal) => { this.remove(identity, code, signal).catch(() => undefined) })

        configure?.(process)

        // Initial activation is one endpoint transition too. A server that
        // exits immediately is queued behind it, preserving the only coherent
        // order: Process creation, endpoint start, endpoint stop, Process exit.
        await this.transition(process, async () => {

            if (client && window) process.startClient(window)

            if (child) this.activateServer(process, child)

            // The subject first, which is what scopes a listener without
            // anything being checked: a kit's `Events` refuses a value whose
            // first item is not the subject it was built for, so a program's
            // listener hears only its own program's news by the shape of the
            // message rather than by a rule somewhere reading it.
            //
            // An unscoped listener — `host` — is built for no subject and so
            // receives the subject as its first value.
            await this.announce("processCreate", program.identity, program.reference, processReference(process))

            await this.$outbound.publish("/created", process.hosted())

            if (window) this.settleFront(window.layer, front)

            if (process.server) await this.serverStarted(process)

            if (process.client) {

                await this.$outbound.publish("/client-start", process.identity, process.hosted())

                await this.endpointEvent("endpointStart", process, "client")
            }
        })

        return process
    }

    public async remove(identity: string, code: number | null = 0, signal: NodeJS.Signals | null = null) {

        const process = this.processes.get(identity)

        if (!process) return

        // Who had focus while this one was still here, in its own layer.
        // A window closing hands it to whatever is left showing
        // underneath *it* — a layer emptying hands nothing across.
        const layer = process.client?.window.layer ?? null

        const front = layer && this.front(layer)

        if (!this.processes.delete(identity)) return

        process.server?.release("The process ended before answering")

        for (const [key, boundary] of this.clientForwarders) {

            if (boundary.pane !== identity) continue

            boundary.release()

            this.clientForwarders.delete(key)
        }

        // Dropping the record is an ending, and for a program with no
        // server half it is the only one there will ever be.
        process.ended(code, signal)

        // The subject leads so that narrowing is the shape of the
        // message, and what follows is the thing the event is about —
        // the process, whole, not an identity a listener would have to look
        // up. It is already gone, which is what `exited()` answers and
        // why holding it is legitimate.
        await this.announce("processExit", process.program.identity, process.program.reference, processReference(process), code, signal)

        // The same ending, said to whoever holds this one process rather
        // than to whoever watches the program. A launcher wants the
        // second; a program managing its instances wants the first.
        await this.hostTraffic.emitSubject("exit", process.reference, code, signal)

        // The window that had it is gone, so nobody is told they lost
        // it — only whoever inherits it is told they have it.
        if (layer) this.settleFront(layer, front)

        // Whose it was, said rather than looked up. A session holds the
        // record too and drops it on this same event, so anything that
        // needed to know the program would be racing the handler that
        // removes it — and which of them ran first would decide whether
        // the answer existed.
        // And when it started, because the record is gone by the time a
        // session reads this and that is the one thing an ending cannot
        // recover — a listener handed a process must be handed the whole
        // of one, or the shape a handle promises is not the shape it has.
        await this.$outbound.publish("/exited", process.hosted(), code, signal)

        await this.traffic.end(process.reference, "The process ended — no further events are possible")

        await this.endpointEvents.end(process.reference, "The process ended — no further events are possible")

        this.transitions.delete(identity)
    }

    public async startServer(identity: string) {

        const process = this.find(identity)

        await this.transition(process, async () => {

            if (!process.program.server) throw new Error("This program declared no server half")

            if (process.server) throw new Error("The server endpoint is already running")

            await process.program.validate()

            const child = this.authManager.programManager.spawnServer(process.program)

            try { this.activateServer(process, child) }

            catch (error) {

                signalProcessTree(child, "SIGKILL")

                throw error
            }

            await this.serverStarted(process)
        })

        return identity
    }

    public async stopServer(identity: string) {

        const process = this.find(identity)

        await this.transition(process, async () => {

            if (!process.server) throw new Error("The server endpoint is already stopped")

            if (!process.client) throw new Error("The final live endpoint cannot be stopped; exit the Process instead")

            const stopping = process.server

            this.stoppingServers.add(stopping)

            stopping.stop()

            await stopping.finished
        })

        return identity
    }

    public async startClient(identity: string, overrides?: LaunchClient) {

        const process = this.find(identity)

        await this.transition(process, async () => {

            if (!process.program.client) throw new Error("This program declared no client half")

            if (process.client) throw new Error("The client endpoint is already running")

            await process.program.validate()

            const shape = this.authManager.programManager.clientShape(process.program, overrides)

            const window = this.window(process.program, shape)

            const before = this.front(window.layer)

            process.startClient(window)

            await this.$outbound.publish("/client-start", process.identity, process.hosted())

            this.settleFront(window.layer, before)

            await this.endpointEvent("endpointStart", process, "client")
        })

        return identity
    }

    public async stopClient(identity: string) {

        const process = this.find(identity)

        await this.transition(process, async () => {

            if (!process.client) throw new Error("The client endpoint is already stopped")

            if (process.client.window.layer === "wallpaper") throw new Error("A wallpaper Client cannot be stopped; exit the Process instead")

            if (!process.server) throw new Error("The final live endpoint cannot be stopped; exit the Process instead")

            await this.deactivateClient(process)
        })

        return identity
    }

    private async deactivateClient(process: Process) {

        const layer = process.client?.window.layer ?? null

        const before = layer ? this.front(layer) : null

        process.stopClient()

        for (const [key, boundary] of this.clientForwarders) {

            if (boundary.pane !== process.identity) continue

            boundary.release()

            this.clientForwarders.delete(key)
        }

        await this.$outbound.publish("/client-stop", process.identity, process.hosted())

        if (layer) this.settleFront(layer, before)

        await this.endpointEvent("endpointStop", process, "client")
    }

    private async exitProcess(identity: string) {

        const process = this.find(identity)

        await this.transition(process, async () => {

            const server = process.server

            // Classify and stop the child before awaiting any other teardown.
            // Otherwise a natural child exit during an awaited client
            // announcement could queue behind this transition while this
            // transition waits for that same child's completion.
            if (server) {

                this.stoppingServers.add(server)

                server.stop()

                await server.finished
            }

            if (process.client) await this.deactivateClient(process)

            if (this.processes.get(identity) === process) await this.remove(identity)
        })

        return identity
    }

    // Every instance of one program, ended. The asker goes last when it
    // is one of them: killed first, it would never issue the rest.
    //
    // One implementation for both roads — a process asks over its
    // channel, a pane over the link — because two that agreed today
    // would be two that could stop agreeing.
    @Connect("/exit-all")
    public async exitAll(program: string, asker: string | null = null) {

        const owner = this.authManager.programManager.reachOrRefuse(program)

        const ended = [...this.processes.values()].filter(entry => entry.program === owner).map(entry => entry.identity)

        for (const identity of [...ended.filter(identity => identity !== asker), ...ended.filter(identity => identity === asker)]) await this.stop(identity)

        return ended
    }

    // A desktop supplies the publishing pane separately from the destination.
    // The pane comes from its structural frame gate rather than application
    // data, so a client cannot attribute its publication to another Process.
    @Connect("/send")
    public async publishClient(source: string, identity: string, which: string, values: unknown[]) {

        if (which !== "server" && which !== "client") throw new Error(`A process has no "${which}" end`)

        if (!this.find(source).client) throw new Error("The publishing process has no live client endpoint")

        await this.publish(source, "client", identity, which, values)
    }

    /** A Client emits from the structurally identified pane, never a claimed source. */
    @Connect("/emit")
    public async emitClient(source: string, event: string, payload: unknown) {

        if (!this.find(source).client) return

        await this.endpointEvents.emit(this.find(source).reference, "client", event, payload)
    }

    @Subscribe("/frame/own")
    protected ownClientFrame(connection: string, pane: string, owner: string) {

        this.ownClient(connection, pane, owner)
    }

    @Subscribe("/frame/release")
    protected releaseClientFrame(connection: string, pane: string, owner: string) {

        this.releaseClient(connection, pane, owner)
    }

    @Subscribe("/frame/subscribe")
    protected subscribeClientFrame(connection: string, pane: string, owner: string, subscription: string, kind: unknown, event: unknown) {

        if (kind !== "publish" || event !== null && typeof event !== "string") return

        this.registerClientSubscription(connection, pane, owner, subscription, event)
    }

    @Subscribe("/frame/unsubscribe")
    protected unsubscribeClientFrame(connection: string, pane: string, owner: string, subscription: string) {

        this.removeClientSubscription(connection, pane, owner, subscription)
    }

    @Subscribe("/frame/observe")
    protected observeClientFrame(connection: string, pane: string, owner: string, subscription: string, target: unknown, half: string, kind: unknown, event: unknown, reportImpossible: unknown) {

        if (!isTrafficKind(kind)) return

        if (event !== null && typeof event !== "string") return

        this.registerClientObservation(connection, pane, owner, subscription, target, half, kind, event, reportImpossible === true)
    }

    @Subscribe("/frame/unobserve")
    protected unobserveClientFrame(connection: string, pane: string, owner: string, subscription: string) {

        this.removeClientObservation(connection, pane, owner, subscription)
    }

    @Subscribe("/frame/follow")
    protected followClientFrame(connection: string, pane: string, owner: string, subscription: string, target: unknown, half: string, event: unknown, reportImpossible: unknown) {

        if (event !== null && typeof event !== "string") return

        this.registerClientFollow(connection, pane, owner, subscription, target, half, event, reportImpossible === true)
    }

    @Subscribe("/frame/unfollow")
    protected unfollowClientFrame(connection: string, pane: string, owner: string, subscription: string) {

        this.removeClientFollow(connection, pane, owner, subscription)
    }

    @Subscribe("/frame/log")
    protected logClientFrame(_connection: string, pane: string, kind: unknown, content: unknown) {

        if (typeof kind !== "string" || typeof content !== "string") return

        const process = this.processes.get(pane)

        if (!process?.client) return

        this.authManager.programManager.record(process.program, process.identity, "client", kind, content)
    }

    // Host facts enter only the Process boundaries whose endpoint subscriptions
    // established a matching the-link route.
    public async announce(event: string, publicSubject: string, scopedSubject: string, ...values: unknown[]) {

        await this.hostTraffic.emit(event, publicSubject, scopedSubject, ...values)
    }

    /** Reads the effective permission decision for one live Client Process. */
    public permissionGranted(identity: string, permission: PermissionName): boolean | null {

        const process = this.find(identity)

        if (!process.client) throw new Error("This process has no live client endpoint")

        if (process.permissions.has(permission)) return true

        return this.authManager.programManager.permission(process.program, permission) ?? null
    }

    /** Creates at most one user-facing permission request for a Client Process. */
    public async requestPermission(identity: string, request: string, permission: PermissionName) {

        const process = this.find(identity)

        if (!process.client) throw new Error("This process has no live client endpoint")

        const known = this.permissionGranted(identity, permission)

        if (known !== null) return known

        const choice = await this.authManager.dialogManager.requestPermission(process, request, permission)

        if (choice === "process") {

            if (this.processes.get(identity) !== process || !process.client) return null

            process.permissions.add(permission)

            await this.permissionChanged(process.program, permission)

            return true
        }

        if (choice === "always") {

            if (this.processes.get(identity) !== process || !process.client) return null

            this.authManager.programManager.setPermission(process.program, permission, true)

            return true
        }

        return choice
    }

    public async cancelPermission(identity: string, request: string) {

        const process = this.processes.get(identity)

        if (!process) return

        await this.authManager.dialogManager.cancelPermission(request, process.reference)
    }

    /** Publishes one effective-decision change to every desktop counterpart. */
    public async permissionChanged(program: Program, permission: PermissionName) {

        for (const process of this.processes.values()) {

            if (process.program !== program || !process.client) continue

            await this.$outbound.publish("/permission", process.identity, permission, this.permissionGranted(process.identity, permission))
        }
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

        if (process?.client) this.hostTraffic.emitSubject(event, process.reference, value).catch(() => undefined)

        this.$outbound.publish("/said", identity, event, value).catch(() => undefined)
    }

    // The host's vocabulary — the words a program may address to its
    // environment. Predefined and finite: the kits' named operations
    // compile to exactly these. Unknown words are refused, so a
    // misspelling fails loudly instead of vanishing.
    protected async endHost(process: Process, args: unknown[]): Promise<unknown[]> {

        const [word, ...rest] = args

        const programManager = this.authManager.programManager

        if (word === "programs") return [[...programManager.programs.values()].filter(entry => rest[0] !== true || entry.installed)]

        if (word === "program") {

            const identity = typeof rest[0] === "string" ? rest[0] : process.program.identity

            return [programManager.find(identity)]
        }

        if (word === "api-docs") {

            return [this.heldProgram(rest[0], process.program).apiDocs()]
        }

        if (word === "icon") {

            return [await programManager.icon(this.heldProgram(rest[0], process.program).identity, rest[1])]
        }

        if (word === "startup") {

            const program = this.heldProgram(rest[0], process.program)

            return [await programManager.startup(program, String(rest[1]), rest[2])]
        }

        if (word === "permissions") {

            const program = this.heldProgram(rest[0], process.program)
            const operation = rest[1]
            const name = rest[2]

            if (operation === "getAll") return [programManager.permissions(program)]

            if (!isPermissionName(name)) throw new Error(`The system does not know the permission "${String(name)}"`)

            if (operation === "get") return [programManager.permission(program, name)]

            if (operation === "set") {

                if (typeof rest[3] !== "boolean") throw new Error("A permission decision must be boolean")

                programManager.setPermission(program, name, rest[3])

                return []
            }

            if (operation === "delete") {

                programManager.deletePermission(program, name)

                return []
            }

            throw new Error(`The host does not know the permission operation "${String(operation)}"`)
        }

        // Which live process made this one through `program.createProcess()`.
        // The child retains a handle, but the registry remains authoritative:
        // once the parent disappears that retained handle no longer resolves.
        if (word === "parent") {

            const target = this.heldProcess(rest[0], process)

            if (!target.parent) return [null]

            if (this.processes.get(target.parent.identity) !== target.parent) throw new Error("The parent Process no longer exists")

            return [processReference(target.parent)]
        }

        // A program brought into being by a program enters the same
        // registry and returns the same record shape as every other
        // program. Its installed flag begins false.
        if (word === "create-program") {

            const source = rest[0]

            if (typeof source !== "string" && (typeof source !== "object" || source === null)) throw new Error("A program is created from a config or a path")

            const created = await programManager.create(source as Parameters<typeof programManager.create>[0])

            return [programManager.find(created.identity)]
        }

        if (word === "theme") return [this.authManager.linkManager.theme.value]

        if (word === "update-theme") return [await this.authManager.updateTheme(rest[0])]

        if (word === "wallpaper") {

            const surface = rest[0]

            const operation = rest[1]

            const link = this.authManager.linkManager

            if (surface === "sign-in") {

                if (operation === "set") return [await link.setSignInWallpaper(rest[2])]

                if (operation === "remove") return [await link.removeSignInWallpaper()]

                throw new Error(`The host does not know the sign-in wallpaper operation "${String(operation)}"`)
            }

            if (surface === "desktop") {

                if (operation === "set") return [await link.setDesktopWallpaper(rest[2])]

                if (operation === "remove") return [await link.removeDesktopWallpaper()]

                if (operation === "set-program") {

                    const program = this.heldProgram(rest[2])

                    return [await link.setDesktopWallpaperProgram(program, rest[3] as import("@phreshos/core").WallpaperLaunch)]
                }

                throw new Error(`The host does not know the desktop wallpaper operation "${String(operation)}"`)
            }

            throw new Error(`The host does not know the wallpaper surface "${String(surface)}"`)
        }

        // Laid out here, or removed from here. Both operations mutate the
        // installed flag on the exact Program the caller addressed.
        if (word === "install") {

            const program = this.heldProgram(rest[0])

            return [await programManager.install(program, process.identity)]
        }

        if (word === "fork") {

            const program = this.heldProgram(rest[0])

            const forked = await programManager.fork(program, String(rest[1]))

            return [programManager.find(forked.identity)]
        }

        if (word === "installed") {

            return [programManager.installed(this.heldProgram(rest[0]))]
        }

        if (word === "uninstall") {

            const program = this.heldProgram(rest[0])

            return [await programManager.uninstall(program, rest[1] === true, process.identity)]
        }

        if (word === "forget") {

            const program = this.heldProgram(rest[0])

            return [await programManager.forget(program, process.identity)]
        }

        if (word === "create-process") {

            const program = this.heldProgram(rest[0])

            // The whole record, not the identity alone: the kit builds a
            // Process from this answer, and a record invented at the
            // other end — identity and program, nothing else — was how every
            // process held by its launcher had no startedAt while every
            // other road's did.
            return [processReference(this.find(await programManager.createProcess(program.identity, rest[1] as Launch, process)))]
        }

        // Named, only that program's instances; unnamed, every one.
        if (word === "processes") {

            const living = [...this.processes.values()]

            if (rest[0] === undefined) return [living.map(processReference)]

            // Resolved before it is filtered. Filtering alone answered
            // an empty list for a program the system does not know,
            // which reads as *running nothing* and is a different claim
            // from *there is no such program* — every other act on one
            // refuses, and a word that answers falsely where its
            // neighbours refuse is worse than either.
            const program = this.heldProgram(rest[0])

            return [living.filter(entry => entry.program === program).map(processReference)]
        }

        if (word === "program-process") {

            const program = this.heldProgram(rest[0])

            const wanted = String(rest[1])

            const identified = this.processes.get(wanted)

            if (identified?.program === program) return [processReference(identified)]

            const found = [...this.processes.values()].find(entry => entry.program === program && entry.name === wanted)

            return [found ? processReference(found) : null]
        }

        if (word === "process") {

            const target = typeof rest[0] === "string" ? this.find(rest[0]) : this.heldProcess(rest[0], process)

            return [processReference(target)]
        }

        if (word === "exists") {

            const target = this.heldProcess(rest[1], process)

            if (rest[0] === "server") return [target.server !== null]

            if (rest[0] === "client") return [target.client !== null]

            throw new Error("A Process endpoint is server or client")
        }

        if (word === "start-endpoint") {

            const target = this.heldProcess(rest[0], process)

            if (rest[1] === "server") return [await this.startServer(target.identity)]

            if (rest[1] === "client") return [await this.startClient(target.identity, rest[2] as LaunchClient | undefined)]

            throw new Error("A Process endpoint is server or client")
        }

        if (word === "stop-endpoint") {

            const target = this.heldProcess(rest[0], process)

            if (rest[1] === "server") return [await this.stopServer(target.identity)]

            if (rest[1] === "client") return [await this.stopClient(target.identity)]

            throw new Error("A Process endpoint is server or client")
        }

        if (word === "stop-current") return [await this.stopServer(process.identity)]

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

            const { process: target, window } = this.heldWindow(rest[0], process)

            return [{

                title: window.title,

                position: window.position,

                size: window.size,

                minimized: window.minimized,

                // At the front of its own layer — which is ordering, and
                // is not the keyboard. There is no word here for the
                // keyboard at all.
                front: this.front(window.layer) === target.identity,

                // Which layer it lives in, and which of its own pages it
                // was opened at. A launch may say either, so a program
                // cannot read them off its own description — and `front`
                // is a weaker claim than it reads as unless you know
                // which layer it is the front of.
                layer: window.layer,

                location: window.location
            }]
        }

        if (word === "move") {

            const target = this.heldWindow(rest[0], process).process.identity

            await this.move(target, rest[1] as Position)

            return [target]
        }

        if (word === "resize") {

            const target = this.heldWindow(rest[0], process).process.identity

            await this.resize(target, rest[1] as Size)

            return [target]
        }

        if (word === "surfaceSet") {

            const target = this.heldWindow(rest[0], process).process.identity

            await this.surface(target, rest[1] === undefined ? {} : rest[1])

            return [target]
        }

        if (word === "surfaceRemove") {

            const target = this.heldWindow(rest[0], process).process.identity

            await this.surface(target, null)

            return [target]
        }

        if (word === "changeTitle") {

            const target = this.heldWindow(rest[0], process).process.identity

            await this.changeTitle(target, String(rest[1] ?? ""))

            return [target]
        }

        if (word === "raise") {

            const target = this.heldWindow(rest[0], process).process.identity

            await this.raise(target)

            return [target]
        }

        if (word === "minimize") {

            const target = this.heldWindow(rest[0], process).process.identity

            await this.minimize(target, rest[1] !== false)

            return [target]
        }

        if (word === "exit") {

            const target = this.heldProcess(rest[0], process)

            await this.stop(target.identity)

            return [target.identity]
        }

        if (word === "exit-all") return [await this.exitAll(this.heldProgram(rest[0]).identity, process.identity)]

        if (word === "observe") {

            const kind = rest[3]

            const event = rest[4]

            const reportImpossible = rest[5] === true

            if (!isTrafficKind(kind)) return []

            if (event !== null && typeof event !== "string") return []

            const target = this.heldProcess(rest[1], process)

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

            const target = this.heldProcess(rest[1], process)

            this.followServer(process, String(rest[0]), target, String(rest[2]), event, rest[4] === true)

            return []
        }

        if (word === "unfollow") {

            this.unfollowServer(process, String(rest[0]))

            return []
        }

        if (word === "emit") {

            if (typeof rest[0] !== "string") return []

            await this.endpointEvents.emit(process.reference, "server", rest[0], rest[1])

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

            const target = this.heldProcess(rest[0])

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

            const targetProcess = this.heldProcess(rest[0])

            const target = targetProcess.server

            if (!target) {

                this.rejectQuestion(["wait", question, rest[3], rest[4], ...rest.slice(5)], "This process has no live server endpoint")

                return []
            }

            process.server?.retain(question, () => target.forget(question))

            this.asked(process.identity, "server", targetProcess.identity, rest.slice(2))

            return []
        }

        // What a launch said, carried by the process it launched.
        if (word === "option") {

            const asked = this.heldProcess(rest[0], process)

            return [asked.options[String(rest[1])]]
        }

        // A server SDK asks the host only where a Program's area begins;
        // every filesystem operation belongs to the SDK after that. The
        // area is shared by every Process, so the Program is named rather
        // than the Process. With no name, it is the asker's own Program.
        if (word === "data" || word === "cache") {

            // The one registry is the authority for every program,
            // installed or not. Naming the current program explicitly
            // must therefore be equivalent to leaving the subject empty.
            const program = this.heldProgram(rest[0], process.program)

            if (rest[1] !== "path") throw new Error("A server half asks the host only for an area path")

            return [programManager.operate(program, word, "path", [])]
        }

        // What a program has said, asked for and never told. The
        // connection behind this is read-only, so a query that tries to
        // change what it reads is refused by the database rather than by
        // anything here deciding what a query means.
        if (word === "logs") {

            const program = this.heldProgram(rest[0], process.program)

            return [programManager.logsOf(program).query(String(rest[1]), Array.isArray(rest[2]) ? rest[2] : [])]
        }

        // A program's own database. Written as well as read, unlike the
        // log above: that is the system's account of a program and this
        // is the program's own, which is why they are two files.
        if (word === "database") {

            const program = this.heldProgram(rest[0], process.program)

            return [programManager.databaseOf(program).query(String(rest[1]), Array.isArray(rest[2]) ? rest[2] : [])]
        }

        // A server half writes served values locally, as it does its program
        // areas. The SDK asks for the one managed root and canonical limit;
        // neither becomes a separate public capability.
        if (word === "serve") {

            const { servedFiles } = this.authManager.linkManager.application

            return [servedFiles.fileManager.path, serveLimit]
        }

        // A program's own persistent key-value store. A Program handle names
        // whose; an omitted subject means the asking process's program. The
        // application store has no generic host road — application methods
        // expose only the values the application actually owns.
        if (word === "store") {

            const [operation, key, value, ttl] = rest.slice(1) as [string, string, unknown, number | undefined]

            const whose = this.heldProgram(rest[0], process.program).identity

            return [await programManager.store(whose, operation, key, value, ttl)]
        }

        throw new Error(`The host does not know the word "${String(word)}"`)
    }

    private async endHostWait(process: Process, question: string, args: unknown[]) {

        try {

            if (args[0] === "wait-ready") {

                const target = this.heldProcess(args[1], process)

                const requireCurrentIncarnation = args[2] === true

                if (!target.program.server) throw new Error("This program declared no server half")

                if (requireCurrentIncarnation && !target.server) throw new Error("This process has no live server endpoint")

                if (target.server?.ready) {

                    this.say(process.server, "host-end", "answer", question, succeeded([]))

                    return
                }

                let active = true

                const incarnation = requireCurrentIncarnation ? target.server : null

                const ready = target.waitReady(() => {

                    if (!active) return

                    active = false

                    this.say(process.server, "host-end", "answer", question, succeeded([]))
                })

                target.onExit(() => {

                    if (!active) return

                    active = false

                    ready()

                    this.say(process.server, "host-end", "answer", question, failed(new Error("The process ended before its server became ready")))
                })

                incarnation?.finished.then(() => {

                    if (!active) return

                    active = false

                    ready()

                    this.say(process.server, "host-end", "answer", question, failed(new Error("The server endpoint stopped before becoming ready")))
                }).catch(() => undefined)

                process.server?.retain(question, () => {

                    active = false

                    ready()
                })

                return
            }

            // The host's words answer with a list — one item each — and a
            // wire carries one value, so the list is that value. A
            // program's own endpoint answers a value directly; these are
            // the two shapes and they meet here.
            const result = await this.endHost(process, args)

            this.say(process.server, "host-end", "answer", question, succeeded(result))
        }

        catch (exception) {

            this.say(process.server, "host-end", "answer", question, failed(exception))
        }
    }

    // A client question retains its cancellation at the server-host
    // counterpart of that exact desktop boundary. Replacing the document or
    // losing the session therefore removes the target's queued request even
    // when the desktop can no longer send an explicit cancellation.
    @Subscribe("/frame/ask")
    protected askClientFrame(connection: string, source: string, identity: string, values: unknown[]) {

        const question = String(values[0])

        if (!this.retainClientQuestion(connection, source, question, identity)) {

            this.rejectClientQuestion(connection, source, ["wait", ...values], "This process has no live server endpoint")

            return
        }

        this.asked(source, "client", identity, values)
    }

    @Subscribe("/frame/cancel")
    protected cancelClientFrame(connection: string, source: string, question: string) {

        this.clientForwarders.get(this.clientOwnerKey(connection, source))?.cancel(question)
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
    protected async endEndClientFrame(connection: string, identity: string, json: string) {

        // The payload crossed The Link as standard JSON in a plain
        // string — parsed here, delivered in its envelope: an end knows
        // who speaks by the route name it hears.
        const values = JSON.parse(json) as unknown[]

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

    @Connect("/stop")
    public async stop(identity: string) {

        return await this.exitProcess(identity)
    }

    @Connect("/endpoint/start")
    protected async startEndpoint(identity: string, which: string, overrides?: LaunchClient) {

        if (which === "server") return await this.startServer(identity)

        if (which === "client") return await this.startClient(identity, overrides)

        throw new Error("A Process endpoint is server or client")
    }

    @Connect("/endpoint/stop")
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
    @Connect("/move")
    public async move(identity: string, position: Position) {

        const window = this.mutableWindowOf(identity)

        window.move(position)

        this.said(identity, "move", window.position)

        return { identity, window }
    }

    @Connect("/resize")
    public async resize(identity: string, size: Size) {

        const window = this.mutableWindowOf(identity)

        window.resize(size)

        this.said(identity, "resize", window.size)

        return { identity, window }
    }

    @Connect("/change-title")
    public async changeTitle(identity: string, title: string) {

        const window = this.mutableWindowOf(identity)

        window.changeTitle(title)

        this.said(identity, "changeTitle", window.title)

        return { identity, window }
    }

    @Connect("/surface")
    public async surface(identity: string, settings: unknown) {

        const window = this.surfaceWindowOf(identity)

        const changed = settings === null ? window.removeSurface() : window.setSurface(settings)

        if (!changed) return null

        return { identity, window }
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
    @Connect("/raise")
    public async raise(identity: string) {

        const window = this.mutableWindowOf(identity)

        const front = this.front(window.layer)

        window.depth = ++this.highest

        this.settleFront(window.layer, front)

        return { identity, window }
    }

    // Shown, or not shown. Nothing else: the order is untouched, so a
    // window hidden and shown again comes back exactly where it was in
    // its layer rather than on top of it.
    @Connect("/minimize")
    public async minimize(identity: string, minimized: boolean) {

        const window = this.mutableWindowOf(identity)

        const front = this.front(window.layer)

        window.minimized = minimized

        this.said(identity, "minimize", window.minimized)

        this.settleFront(window.layer, front)

        return { identity, window }
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

            const window = process.client?.window

            if (!process.client || !window || window.layer === "wallpaper" || window.minimized || window.layer !== layer) continue

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

// Where an answer goes, read out of the question itself.
//
// A question is named by its asker before it leaves — which half of
// which process is holding the promise — so routing an answer needs no
// memory at all. The address is in the message, which is the one place
// it cannot go stale, and the only place that does not require the
// middle to be trusted.
function addressed(question: string): { half: Half, identity: string } | null {

    const [half, identity] = question.split(":")

    if (half !== "server" && half !== "client") return null

    return { half, identity }
}

function isTrafficKind(value: unknown): value is TrafficKind {

    return value === "publish" || value === "ask" || value === "answer"
}

interface HandleAddress {

    identity: string

    reference: string
}

function isHandleAddress(value: unknown): value is HandleAddress {

    return typeof value === "object" && value !== null && "identity" in value && "reference" in value
        && typeof value.identity === "string" && typeof value.reference === "string"
}

// What a launch resolved to, before a window exists to hold it.
//
// Handed to `register` rather than worked out there: the declaration and
// what the launch overrode are reconciled in one place, by whoever is
// starting the process, so there are not two places deciding what a
// window opens as.
interface ShapeBase {

    title: string

    position: Position

    size: Size

    location: string

    minimize: boolean
}

export interface StandardShape extends ShapeBase {

    layer: Layer
}

export interface WallpaperShape extends ShapeBase {

    layer: "wallpaper"
}

export type Shape = StandardShape | WallpaperShape

type EndpointEvent = "endpointStart" | "endpointStop"

export type TransmittedProcessManager = Transmitted<ProcessManager>

// Inside, or not at all. A program joining its own paths from the root
// gives that up knowingly; a join asked of the host does not.
