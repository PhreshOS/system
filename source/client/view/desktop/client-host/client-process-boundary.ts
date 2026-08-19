import AuthManager from "@client/core/link-manager/auth-manager/auth-manager"
import TheLink from "@libs/the-link/the-link"
import host, { TransferredAnswer } from "./host"
import { type PointerHost } from "./pointer"
import ClientTraffic from "./client-traffic"
import { failed, succeeded } from "@server/core/outcome"
import { type TrafficKind } from "@server/core/link-manager/auth-manager/process-manager/process-traffic"
import { isPermissionName, type PermissionName, type Size } from "@phreshos/core"
import { type LocalWindowHost } from "./local-window"

/** The desktop boundary around one iframe execution endpoint. */
export default class ClientProcessBoundary extends TheLink {

    public readonly pane: string

    public readonly element: HTMLIFrameElement

    private readonly authManager: AuthManager

    private readonly desktop: () => Size

    private readonly pointer: PointerHost

    private readonly traffic: ClientTraffic

    private readonly localWindow: LocalWindowHost

    private readonly subscriptions = new Map<string, EndpointSubscription>()

    private readonly blockedSubscriptions = new Map<string, EndpointSubscription>()

    private readonly expected = new Set<string>()

    private readonly requests = new Map<string, () => void>()

    private readonly waiting = new Map<string, WaitingQuestion[]>()

    private readonly trafficSubscriptions = new Map<string, TrafficSubscription>()

    private readonly themeSubscriptions = new Set<string>()

    private stopTheme: (() => void) | null = null

    private readonly trafficDeliveries = new WeakSet<object>()

    // A document can begin executing before its iframe load event gives the
    // desktop a server-host lease. Keep those endpoint envelopes at the near
    // boundary; once the lease exists they follow the same path as later ones.
    private readonly pending = new Array<unknown[]>()

    private pointerStop: (() => void) | null = null

    private pointerPosition: { x: number, y: number } | null = null

    private owner: string | null = null

    private leased: string | null = null

    private document: string | null = null

    public constructor(pane: string, element: HTMLIFrameElement, authManager: AuthManager, desktop: () => Size, pointer: PointerHost, traffic: ClientTraffic, localWindow: LocalWindowHost) {

        super()

        this.pane = pane

        this.element = element

        this.authManager = authManager

        this.desktop = desktop

        this.pointer = pointer

        this.traffic = traffic

        this.localWindow = localWindow

        this.$outbound.forwardTo((route, ...values) => {

            this.element.contentWindow?.postMessage([route, ...values], "*")
        })
    }

    public async own(owner: string) {

        await this.authManager.processManager.ownFrame(this.pane, owner)

        this.owner = owner

        this.leased = owner

        for (const [subscription, description] of this.subscriptions) {

            if (directSubscription(description)) this.authManager.processManager.subscribeFrame(this.pane, owner, subscription, description.kind, description.event).catch(() => undefined)
        }

        const pending = this.pending.splice(0)

        for (const message of pending) this.receive(message)
    }

    public async release() {

        this.localWindow.release(this.pane)

        const owner = this.leased

        this.owner = null

        this.leased = null

        this.document = null

        this.resetEndpoint()

        this.pending.length = 0

        if (owner) await this.authManager.processManager.releaseFrame(this.pane, owner)
    }

    /** Receive one envelope from the iframe endpoint. */
    public receive(message: unknown[]) {

        const [route, ...values] = message

        if (route === "boundary") {

            this.control(values)

            return
        }

        // The SDK reconstructs `current` from this boundary's own Process so
        // `current.server` is the exact handle at `current.process().server`.
        // A module may request that essential self-description before its
        // document reaches the iframe load event that establishes a forwarding
        // lease. It is safe to answer here: this boundary already owns `pane`,
        // and the request contains no selectable subject or outside authority.
        if (!this.owner && route === "end-host" && values[0] === "wait" && typeof values[1] === "string" && values[2] === "process") {

            this.request(values[1], values.slice(2))

            return
        }

        if (!this.owner) {

            this.pending.push(message)

            return
        }

        if (route === "end-end") {

            const asking = values[0] === "wait" && typeof values[1] === "string" ? values[1] : null

            if (asking) this.requests.set(asking, () => {

                this.authManager.processManager.cancel(this.pane, asking).catch(() => undefined)
            })

            this.authManager.processManager.processes.get(this.pane)?.endEnd(...values).catch((error: Error) => {

                if (asking) {

                    this.requests.delete(asking)

                    if (typeof values[2] === "string" && typeof values[3] === "string") this.deliver("end-end", "answer", asking, values[2], values[3], failed(error)).catch(() => undefined)
                }
            })

            return
        }

        if (route !== "end-host") return

        if (values[0] === "wait" && typeof values[1] === "string") {

            this.request(values[1], values.slice(2))

            return
        }

        if (values[0] === "ask" && typeof values[1] === "string" && typeof values[3] === "string") {

            const question = values[3]

            this.requests.set(question, () => {

                this.authManager.processManager.cancel(this.pane, question).catch(() => undefined)
            })
        }

        if (values[0] === "service-ask" && typeof values[2] === "string") {

            const question = values[2]

            this.requests.set(question, () => {

                this.authManager.processManager.cancel(this.pane, question).catch(() => undefined)
            })
        }

        if (values[0] === "pointerSample") {

            this.samplePointer(values[1], values[2])

            return
        }

        host(this.authManager, this.pane, this.desktop, () => this.owner, this.pointer, this.localWindow)(values[0], ...values.slice(1)).catch((error: Error) => {

            if (values[0] === "observe" && typeof values[1] === "string" && values[6] === true) {

                this.impossible(values[1], error.message)

                return
            }

            if (values[0] === "follow" && typeof values[1] === "string" && values[5] === true) {

                this.impossible(values[1], error.message)

                return
            }

        })
    }

    /** Deliver one routed envelope only when this endpoint requested it. */
    public async deliver(route: string, ...values: unknown[]) {

        if (values[0] === "answer" && typeof values[1] === "string") {

            if (!this.expected.has(values[1])) return

            this.requests.delete(values[1])

            await this.$outbound.publish(route, ...values)

            return
        }

        const question = values[0] === "wait" && typeof values[1] === "string" ? values[1] : null

        const eventIndex = question && route === "end-end" ? 3 : 2

        const event = String(question ? values[eventIndex] : values[0])

        const payload = question ? values.slice(eventIndex + 1) : values.slice(1)

        const kind: TrafficKind = question ? "ask" : "publish"

        if (this.accepts(kind, route, event, payload)) {

            await this.$outbound.publish(route, ...values)

            return
        }

        if (!question) return

        const key = `${route}:${event}`

        const waiting = this.waiting.get(key) ?? []

        waiting.push({ route, values, question })

        this.waiting.set(key, waiting)
    }

    public post(route: string, values: unknown[], transfer: Transferable[] = []) {

        this.element.contentWindow?.postMessage([route, ...values], "*", transfer)
    }

    public impossible(subscription: string, reason: string) {

        this.$outbound.publish("boundary", "impossible", subscription, reason).catch(() => undefined)
    }

    private control(values: unknown[]) {

        const [operation, ...args] = values

        if (operation === "document") {

            if (typeof args[0] !== "string" || args[0] === this.document) return

            // The first document establishes this already-mounted iframe
            // representation. A later document replaces it and therefore
            // destroys the previous representation's local Surface.
            if (this.document !== null) this.localWindow.release(this.pane)

            this.document = args[0]

            this.resetEndpoint()

            // The new document cannot use the previous document's forwarding
            // lease while its own lease is still being established.
            this.owner = null

            return
        }

        if (operation === "log") {

            if (typeof args[0] !== "string" || typeof args[1] !== "string") return

            // The iframe supplies only what it said. This boundary supplies
            // the Process identity, so program code has no route for naming a
            // different owner, and logging itself has no response path.
            this.authManager.processManager.log(this.pane, args[0], args[1])

            return
        }

        if (operation === "subscribe") {

            const [subscription, kind, route, event, subject, reportImpossible] = args

            if (typeof subscription !== "string" || !isTrafficKind(kind) || typeof route !== "string") return

            if (event !== null && typeof event !== "string") return

            if (subject !== null && typeof subject !== "string") return

            if (reportImpossible === true && route === "end-end") {

                const process = this.authManager.processManager.processes.get(this.pane)

                const program = process && this.authManager.programManager.programs.get(process.program)

                if (!process || !program?.server) {

                    this.impossible(subscription, process ? "This program declared no server half" : "The process no longer exists")

                    return
                }
            }

            this.removeSubscription(subscription)

            const description = { kind, route, event, subject }

            if (pointerSubscription(description)) {

                this.blockedSubscriptions.set(subscription, description)

                this.authManager.permissionGranted(this.pane, "pointer").then(decision => {

                    if (decision === true) this.allowSubscription(subscription)
                }).catch(() => undefined)

                return
            }

            this.subscriptions.set(subscription, description)

            if (!themeSubscription(description)) this.addTraffic(kind, route, event)

            if (this.owner && directSubscription(description)) this.authManager.processManager.subscribeFrame(this.pane, this.owner, subscription, kind, event).catch(() => undefined)

            if (themeSubscription(description)) {

                this.themeSubscriptions.add(subscription)

                if (!this.stopTheme) this.stopTheme = this.authManager.linkManager.theme.tunnel.subscribe("change", (theme: unknown) => {

                    this.deliver("host-theme", "change", theme).catch(() => undefined)
                })

            }

            if (kind === "ask") this.releaseWaiting(route, event)

            this.updatePointer()

            return
        }

        if (operation === "unsubscribe") {

            if (typeof args[0] === "string") this.removeSubscription(args[0])

            this.updatePointer()

            return
        }

        if (operation === "expect") {

            if (typeof args[0] === "string") this.expected.add(args[0])

            return
        }

        if (operation === "forget") {

            if (typeof args[0] !== "string") return

            const question = args[0]

            this.expected.delete(question)

            this.requests.get(question)?.()

            this.requests.delete(question)

            this.forgetWaiting(question)

            this.forgetPending(question)
        }
    }

    private request(question: string, args: unknown[]) {

        if (!this.expected.has(question)) return

        if (args[0] === "wait-ready") {

            this.waitReady(question, args[1], args[2] === true)

            return
        }

        if (args[0] === "permission-request") {

            if (!isPermissionName(args[1])) {

                this.deliver("host-end", "answer", question, failed(new Error(`The system does not know the permission "${String(args[1])}"`))).catch(() => undefined)

                return
            }

            const controller = new AbortController()

            this.answerRequest(

                question,

                this.authManager.requestPermission(this.pane, args[1], controller.signal).then(decision => [decision]),

                () => controller.abort()
            )

            return
        }

        this.answerRequest(question, host(this.authManager, this.pane, this.desktop, () => this.owner, this.pointer, this.localWindow)(args[0], ...args.slice(1)))
    }

    private answerRequest(question: string, operation: Promise<unknown[] | TransferredAnswer>, cancel: () => void = () => undefined) {

        let active = true

        this.requests.set(question, () => {

            if (!active) return

            active = false

            cancel()
        })

        operation.then(

            answer => {

                if (!active || !this.expected.has(question)) return

                this.requests.delete(question)

                const transferred = answer instanceof TransferredAnswer ? answer : null

                if (transferred) this.post("host-end", ["answer", question, succeeded(transferred.result)], transferred.transfer)

                else this.deliver("host-end", "answer", question, succeeded(answer)).catch(() => undefined)
            },

            (error: Error) => {

                if (!active || !this.expected.has(question)) return

                this.requests.delete(question)

                this.deliver("host-end", "answer", question, failed(error)).catch(() => undefined)
            }
        )
    }

    private waitReady(question: string, target: unknown, requireCurrentIncarnation: boolean) {

        const mine = this.authManager.processManager.processes.get(this.pane)

        const process = target === undefined || target === null
            ? mine
            : isHandleAddress(target)
                ? this.authManager.processManager.processes.get(target.identity)
                : undefined

        if (!mine || !process || mine.program !== process.program || (isHandleAddress(target) && process.reference !== target.reference)) {

            this.deliver("host-end", "answer", question, failed(new Error("The desktop does not know this process"))).catch(() => undefined)

            return
        }

        const program = this.authManager.programManager.programs.get(process.program)

        if (!program?.server) {

            this.deliver("host-end", "answer", question, failed(new Error("This program declared no server half"))).catch(() => undefined)

            return
        }

        if (requireCurrentIncarnation && !process.server) {

            this.deliver("host-end", "answer", question, failed(new Error("This process has no live server endpoint"))).catch(() => undefined)

            return
        }

        if (process.server?.ready) {

            this.deliver("host-end", "answer", question, succeeded([])).catch(() => undefined)

            return
        }

        let active = true

        const stopReady = this.authManager.processManager.$inbound.subscribe("/server-ready", (identity: unknown) => {

            if (!active || identity !== process.identity || this.authManager.processManager.processes.get(process.identity) !== process || !this.expected.has(question)) return

            stop()

            this.requests.delete(question)

            this.deliver("host-end", "answer", question, succeeded([])).catch(() => undefined)
        })

        const stopExit = this.authManager.processManager.$inbound.subscribe("/exited", (payload: unknown) => {

            if (!active || !payload || typeof payload !== "object" || (payload as { reference?: unknown }).reference !== process.reference) return

            stop()

            this.requests.delete(question)

            this.deliver("host-end", "answer", question, failed(new Error("The process ended before its server became ready"))).catch(() => undefined)
        })

        const stopServer = requireCurrentIncarnation
            ? this.authManager.processManager.$inbound.subscribe("/server-stop", (identity: unknown) => {

                if (!active || identity !== process.identity || this.authManager.processManager.processes.get(process.identity) !== process) return

                stop()

                this.requests.delete(question)

                this.deliver("host-end", "answer", question, failed(new Error("The server endpoint stopped before becoming ready"))).catch(() => undefined)
            })
            : () => undefined

        const stop = () => {

            if (!active) return

            active = false

            stopReady()

            stopExit()

            stopServer()
        }

        this.requests.set(question, stop)
    }

    private accepts(kind: TrafficKind, route: string, event: string, payload: unknown[]) {

        for (const subscription of this.subscriptions.values()) {

            if (subscription.kind !== kind || subscription.route !== route) continue

            if (subscription.event !== null && subscription.event !== event) continue

            if (subscription.subject !== null && payload[0] !== subscription.subject) continue

            return true
        }

        return false
    }

    private addTraffic(kind: TrafficKind, route: string, event: string | null) {

        const key = JSON.stringify([kind, route, event])

        const current = this.trafficSubscriptions.get(key)

        if (current) {

            current.count++

            return
        }

        const stop = this.traffic.observe(this.pane, route, kind, event, (delivery, ...values) => {

            if (this.trafficDeliveries.has(delivery)) return

            this.trafficDeliveries.add(delivery)

            this.deliver(route, ...values).catch(() => undefined)
        })

        this.trafficSubscriptions.set(key, { count: 1, stop })
    }

    private removeSubscription(subscription: string) {

        this.blockedSubscriptions.delete(subscription)

        const existing = this.subscriptions.get(subscription)

        if (!existing) return

        if (this.owner && directSubscription(existing)) this.authManager.processManager.unsubscribeFrame(this.pane, this.owner, subscription).catch(() => undefined)

        this.subscriptions.delete(subscription)

        if (this.themeSubscriptions.delete(subscription) && this.themeSubscriptions.size === 0) {

            this.stopTheme?.()

            this.stopTheme = null
        }

        const key = JSON.stringify([existing.kind, existing.route, existing.event])

        const traffic = this.trafficSubscriptions.get(key)

        if (!traffic) return

        traffic.count--

        if (traffic.count > 0) return

        traffic.stop()

        this.trafficSubscriptions.delete(key)
    }

    private allowSubscription(subscription: string) {

        const description = this.blockedSubscriptions.get(subscription)

        if (!description) return

        this.blockedSubscriptions.delete(subscription)

        this.subscriptions.set(subscription, description)

        this.updatePointer()
    }

    /** Applies an authoritative effective-decision change to guarded subscriptions. */
    public permissionChanged(permission: PermissionName, decision: boolean | null) {

        if (permission !== "pointer") return

        if (decision === true) {

            for (const subscription of [...this.blockedSubscriptions.keys()]) this.allowSubscription(subscription)

            return
        }

        for (const [subscription, description] of [...this.subscriptions]) {

            if (!pointerSubscription(description)) continue

            this.removeSubscription(subscription)

            this.blockedSubscriptions.set(subscription, description)
        }

        this.updatePointer()
    }

    private releaseWaiting(route: string, event: string | null) {

        for (const [key, waiting] of this.waiting) {

            if (!key.startsWith(`${route}:`)) continue

            const remaining: WaitingQuestion[] = []

            for (const held of waiting) {

                const eventIndex = held.route === "end-end" ? 3 : 2

                const word = String(held.values[eventIndex])

                const payload = held.values.slice(eventIndex + 1)

                if ((event === null || event === word) && this.accepts("ask", route, word, payload)) this.$outbound.publish(held.route, ...held.values).catch(() => undefined)

                else remaining.push(held)
            }

            if (remaining.length) this.waiting.set(key, remaining)

            else this.waiting.delete(key)
        }
    }

    private forgetWaiting(question: string) {

        for (const [key, waiting] of this.waiting) {

            const remaining = waiting.filter(held => held.question !== question)

            if (remaining.length) this.waiting.set(key, remaining)

            else this.waiting.delete(key)
        }
    }

    private forgetPending(question: string) {

        const remaining = this.pending.filter(message => {

            const [route, operation] = message

            if ((route === "end-end" || route === "end-host") && operation === "wait") return message[2] !== question

            if (route === "end-host" && operation === "ask") return message[4] !== question

            if (route === "end-host" && operation === "service-ask") return message[3] !== question

            return true
        })

        this.pending.splice(0, this.pending.length, ...remaining)
    }

    private resetEndpoint() {

        for (const stop of this.requests.values()) stop()

        this.pointerStop?.()

        this.requests.clear()

        this.pointerStop = null

        this.pointerPosition = null

        if (this.owner) for (const [subscription, description] of this.subscriptions) {

            if (directSubscription(description)) this.authManager.processManager.unsubscribeFrame(this.pane, this.owner, subscription).catch(() => undefined)
        }

        this.subscriptions.clear()

        this.blockedSubscriptions.clear()

        this.themeSubscriptions.clear()

        this.stopTheme?.()

        this.stopTheme = null

        for (const { stop } of this.trafficSubscriptions.values()) stop()

        this.trafficSubscriptions.clear()

        this.expected.clear()

        this.waiting.clear()

        this.pending.length = 0
    }

    private updatePointer() {

        const wanted = [...this.subscriptions.values()].some(pointerSubscription)

        if (!wanted) {

            this.pointerStop?.()

            this.pointerStop = null

            this.pointerPosition = null

            return
        }

        if (this.pointerStop) return

        this.pointerPosition = this.pointer.position()

        this.pointerStop = this.pointer.$inbound.subscribe("move", (position: unknown) => {

            if (!isPointerPosition(position)) return

            this.pointerPosition = position

            this.deliver("host-pointer", "move", position).catch(() => undefined)
        })
    }

    // Pointer movement inside a sandboxed iframe does not bubble into the
    // desktop document. Advance the last desktop-space position retained by
    // this boundary, never a frame-relative coordinate.
    private samplePointer(movementX: unknown, movementY: unknown) {

        const position = this.pointerPosition

        if (!position || typeof movementX !== "number" || typeof movementY !== "number" || !Number.isFinite(movementX) || !Number.isFinite(movementY)) return

        const next = { x: position.x + Number(movementX), y: position.y + Number(movementY) }

        this.pointerPosition = next

        this.deliver("host-pointer", "move", next).catch(() => undefined)
    }
}

function isPointerPosition(value: unknown): value is { x: number, y: number } {

    if (!value || typeof value !== "object") return false

    const position = value as { x?: unknown, y?: unknown }

    return typeof position.x === "number" && typeof position.y === "number"
}

interface EndpointSubscription {

    kind: TrafficKind

    route: string

    event: string | null

    subject: string | null
}

function pointerSubscription(subscription: EndpointSubscription) {

    return subscription.kind === "publish" && subscription.route === "host-pointer" && (subscription.event === null || subscription.event === "move")
}

function themeSubscription(subscription: EndpointSubscription) {

    return subscription.kind === "publish" && subscription.route === "host-theme" && (subscription.event === null || subscription.event === "change")
}

function directSubscription(subscription: EndpointSubscription) {

    return subscription.route === "end-end" && subscription.kind === "publish"
}

function isTrafficKind(value: unknown): value is TrafficKind {

    return value === "publish" || value === "ask" || value === "answer"
}

function isHandleAddress(value: unknown): value is { identity: string, reference: string } {

    return typeof value === "object" && value !== null && "identity" in value && "reference" in value
        && typeof value.identity === "string" && typeof value.reference === "string"
}

interface WaitingQuestion {

    route: string

    values: unknown[]

    question: string
}

interface TrafficSubscription {

    count: number

    stop: () => void
}
