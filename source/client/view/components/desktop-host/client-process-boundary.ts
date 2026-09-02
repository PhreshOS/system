import AuthManager from "@client/core/link-manager/auth-manager/auth-manager"
import { TheLink } from "@the-link/core"
import host, { TransferredAnswer } from "./host"
import ClientTraffic from "./client-traffic"
import { failed, succeeded } from "@server/core/outcome"
import { type TrafficKind } from "@server/core/link-manager/auth-manager/process-manager/process-traffic"
import { type DesktopSurfaceSnapshot } from "@phreshos/core"
import { type LocalWindowHost } from "./local-window"
import messagepack from "@libs/messagepack"
import { sdkProcess, type SdkProcessSource } from "./sdk-records"
import SystemAccess from "./system-access"

/** The desktop boundary around one iframe execution endpoint. */
export default class ClientProcessBoundary extends TheLink {

    public readonly pane: string

    public readonly element: HTMLIFrameElement

    private readonly authManager: AuthManager

    private readonly desktop: () => DesktopSurfaceSnapshot

    private readonly traffic: ClientTraffic

    private readonly localWindow: LocalWindowHost

    private readonly systemAccess: SystemAccess

    private readonly subscriptions = new Map<string, EndpointSubscription>()

    private readonly expected = new Set<string>()

    private readonly requests = new Map<string, () => void>()

    private readonly waiting = new Map<string, WaitingQuestion[]>()

    private readonly trafficSubscriptions = new Map<string, TrafficSubscription>()

    /** Program ownership of Endpoint subscriptions; `null` marks a Service. */
    private readonly systemSubscriptions = new Map<string, string | null>()

    private readonly desktopPreferencesSubscriptions = new Set<string>()

    private stopDesktopPreferences: (() => void) | null = null

    private readonly appearanceSubscriptions = new Set<string>()

    private stopAppearance: (() => void) | null = null

    private readonly trafficDeliveries = new WeakSet<object>()

    // A document can begin executing before its iframe load event gives the
    // desktop a server-host lease. Keep those endpoint envelopes at the near
    // boundary; once the load establishes ownership they follow the same path
    // as later ones.
    private readonly pending = new Array<unknown[]>()

    private owner: string | null = null

    private leased: string | null = null

    public constructor(pane: string, element: HTMLIFrameElement, authManager: AuthManager, desktop: () => DesktopSurfaceSnapshot, traffic: ClientTraffic, localWindow: LocalWindowHost) {

        super()

        this.pane = pane

        this.element = element

        this.authManager = authManager

        this.desktop = desktop

        this.traffic = traffic

        this.localWindow = localWindow

        this.systemAccess = new SystemAccess(authManager, pane)

        this.$outbound.forwardTo((route, ...values) => {

            this.send([route, ...values])
        })
    }

    public async own(owner: string) {

        // The iframe load event is the document lifecycle boundary. Preserve
        // what the newly loading document already sent, discard everything
        // retained for the previous document, then replay the preserved
        // envelopes only after the new server-host lease exists.
        const pending = this.pending.splice(0)

        if (this.leased) this.localWindow.release(this.pane)

        this.resetEndpoint()

        this.owner = null

        try {

            await this.authManager.processManager.ownFrame(this.pane, owner)
        }

        catch (error) {

            this.pending.unshift(...pending)

            throw error
        }

        this.owner = owner

        this.leased = owner

        for (const [subscription, description] of this.subscriptions) {

            if (directSubscription(description)) this.authManager.processManager.subscribeFrame(this.pane, owner, subscription, description.kind, description.event).catch(() => undefined)
        }

        pending.push(...this.pending.splice(0))

        for (const message of pending) this.receive(message)
    }

    public async release() {

        this.localWindow.release(this.pane)

        const owner = this.leased

        this.owner = null

        this.leased = null

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

        // The SDK reconstructs `context` from this boundary's own Process so
        // `context.server` is the exact handle at `context.process().server`.
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

        if (values[0] === "stream" && typeof values[1] === "string") {

            this.streamRequest(values[1], values.slice(2))

            return
        }

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

        this.trackSystemSubscription(values)

        host(this.authManager, this.pane, this.desktop, () => this.owner, this.localWindow)(values[0], ...values.slice(1)).catch((error: Error) => {

            if (values[0] === "observe" && typeof values[1] === "string" && values[6] === true) {

                this.impossible(values[1], error.message)

                return
            }

            if (values[0] === "follow" && typeof values[1] === "string" && values[5] === true) {

                this.impossible(values[1], error.message)

                return
            }

            if (values[0] === "service-follow" && typeof values[1] === "string" && values[5] === true) {

                this.impossible(values[1], error.message)

                return
            }

            if (values[0] === "ask" && typeof values[3] === "string") {

                this.requests.delete(values[3])
                this.deliver("end-end", "answer", values[3], values[4], values[5], failed(error)).catch(() => undefined)

                return
            }

            if (values[0] === "service-ask" && typeof values[2] === "string") {

                this.requests.delete(values[2])
                this.deliver("end-end", "answer", values[2], values[3], values[4], failed(error)).catch(() => undefined)
            }

        })
    }

    /** Deliver one routed envelope only when this endpoint requested it. */
    public async deliver(route: string, ...values: unknown[]) {

        if (!await this.canDeliverSystemSubscription(route, values[0])) return

        values = await this.visibleReferences(values)

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

        this.send([route, ...values], transfer)
    }

    private send(message: unknown[], transfer: Transferable[] = []) {

        const target = this.element.contentWindow

        if (!target) return

        const attachments = nativeAttachments(message, transfer)

        const bytes = messagepack.serialize(message, attachments)

        target.postMessage([bytes, ...attachments], "*", [bytes.buffer, ...transfer])
    }

    public impossible(subscription: string, reason: string) {

        this.$outbound.publish("boundary", "impossible", subscription, reason).catch(() => undefined)
    }

    private trackSystemSubscription(values: unknown[]) {

        const [operation, subscription, target] = values

        if (typeof subscription !== "string") return

        if (operation === "service-follow") {

            this.systemSubscriptions.set(subscription, null)

            return
        }

        if (operation === "observe" || operation === "follow") {

            const process = target === null
                ? this.authManager.processManager.processes.get(this.pane)
                : isHandleAddress(target)
                    ? this.authManager.processManager.processes.get(target.identity)
                    : undefined

            this.systemSubscriptions.set(subscription, process?.program ?? null)

            return
        }

        if (operation === "service-unfollow" || operation === "unobserve" || operation === "unfollow") {

            this.systemSubscriptions.delete(subscription)
        }
    }

    private async canDeliverSystemSubscription(route: string, subscription: unknown) {

        if (route !== "observed" && route !== "emitted" && route !== "service-event") return true
        if (typeof subscription !== "string" || !this.systemSubscriptions.has(subscription)) return false

        const program = this.systemSubscriptions.get(subscription)

        return program !== null && program !== undefined && this.systemAccess.ownsProgram({ identity: program })
            ? true
            : await this.systemAccess.all()
    }

    private async visibleReferences(values: unknown[]) {

        let unrestricted: Promise<boolean> | null = null

        const visible = async (reference: EndpointReference) => {

            const process = reference.process

            if (this.systemAccess.ownsProgram(process.program)) return reference

            unrestricted ??= this.systemAccess.all()

            return await unrestricted ? reference : null
        }

        return await Promise.all(values.map(async value => {

            if (!value || typeof value !== "object" || Array.isArray(value)) return value

            const envelope = value as Record<string, unknown>

            if (isEndpointReference(envelope.from)) return { ...envelope, from: await visible(envelope.from) }
            if (isEndpointReference(envelope.to)) return { ...envelope, to: await visible(envelope.to) }

            return value
        }))
    }

    private control(values: unknown[]) {

        const [operation, ...args] = values

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

            this.subscriptions.set(subscription, description)

            if (!localPropertySubscription(description)) this.addTraffic(kind, route, event)

            if (this.owner && directSubscription(description)) this.authManager.processManager.subscribeFrame(this.pane, this.owner, subscription, kind, event).catch(() => undefined)

            if (desktopPreferencesSubscription(description)) {

                this.desktopPreferencesSubscriptions.add(subscription)

                if (!this.stopDesktopPreferences) this.stopDesktopPreferences = this.authManager.linkManager.desktopPreferences.tunnel.subscribe("change", (preferences: unknown) => {

                    this.deliver("host-desktop-preferences", "change", preferences).catch(() => undefined)
                })

            }

            if (appearanceSubscription(description)) {

                this.appearanceSubscriptions.add(subscription)

                if (!this.stopAppearance) this.stopAppearance = this.authManager.linkManager.appearance.tunnel.subscribe("change", (appearance: unknown) => {

                    this.deliver("host-appearance", "change", appearance).catch(() => undefined)
                })

            }

            if (kind === "ask") this.releaseWaiting(route, event)

            return
        }

        if (operation === "unsubscribe") {

            if (typeof args[0] === "string") this.removeSubscription(args[0])

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

            this.waitReady(question, args[1], args[2], args[3] === true)

            return
        }

        if (args[0] === "context-permission-request" && typeof args[1] === "string") {

            this.answerRequest(
                question,
                host(this.authManager, this.pane, this.desktop, () => this.owner, this.localWindow)(args[0], ...args.slice(1)),
                () => { this.authManager.cancelPermission(this.pane, args[1] as string).catch(() => undefined) }
            )

            return
        }

        this.answerRequest(question, host(this.authManager, this.pane, this.desktop, () => this.owner, this.localWindow)(args[0], ...args.slice(1)))
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

    private streamRequest(question: string, args: unknown[]) {
        let active = true
        let iterator: AsyncIterator<unknown> | null = null

        this.requests.set(question, () => {
            if (!active) return
            active = false
            void iterator?.return?.()
        })

        const run = async () => {
            await this.deliver("host-end", "stream", question, "open")

            if (args[0] !== "install" && args[0] !== "uninstall" && args[0] !== "run") throw new Error(`The desktop does not know the stream operation "${String(args[0])}"`)

            if (!isHandleAddress(args[1])) throw new Error("A Program handle is required")

            const program = this.authManager.programManager.programs.get(args[1].identity)

            if (!program || program.reference !== args[1].reference) throw new Error("The Program represented by this handle does not exist")

            await this.systemAccess.program(program)

            const operation = this.authManager.programManager.command(args[1], args[0], args[2], this.pane)

            iterator = operation[Symbol.asyncIterator]()

            while (active) {
                const next = await iterator.next()

                if (next.done) break

                await this.deliver("host-end", "stream", question, "data", args[0] === "run" ? runEvent(this.authManager, next.value) : next.value)
            }

            if (active && this.expected.has(question)) {
                await this.deliver("host-end", "stream", question, "answer", succeeded(undefined))
            }
        }

        run().catch(async exception => {
            if (active && this.expected.has(question)) {
                await this.deliver("host-end", "stream", question, "answer", failed(exception))
            }
        }).finally(() => {
            active = false
            this.requests.delete(question)
        })
    }

    private async waitReady(question: string, target: unknown, endpoint: unknown, requireCurrentIncarnation: boolean) {

        const process = target === undefined || target === null
            ? this.authManager.processManager.processes.get(this.pane)
            : isHandleAddress(target)
                ? this.authManager.processManager.processes.get(target.identity)
                : undefined

        if (!process || (isHandleAddress(target) && process.reference !== target.reference)) {

            this.deliver("host-end", "answer", question, failed(new Error("The desktop does not know this process"))).catch(() => undefined)

            return
        }

        try { await this.systemAccess.process(process) }

        catch (error) {

            this.deliver("host-end", "answer", question, failed(error)).catch(() => undefined)

            return
        }

        if (endpoint !== "server" && endpoint !== "client") {

            this.deliver("host-end", "answer", question, failed(new Error("Readiness needs an Endpoint"))).catch(() => undefined)

            return
        }

        const program = this.authManager.programManager.programs.get(process.program)

        if (!program?.[endpoint]) {

            this.deliver("host-end", "answer", question, failed(new Error(`This program declared no ${endpoint} Endpoint`))).catch(() => undefined)

            return
        }

        if (requireCurrentIncarnation && !process[endpoint]) {

            this.deliver("host-end", "answer", question, failed(new Error(`This process has no live ${endpoint} Endpoint`))).catch(() => undefined)

            return
        }

        if (endpoint === "server" ? process.server?.ready : process.client) {

            this.deliver("host-end", "answer", question, succeeded([])).catch(() => undefined)

            return
        }

        let active = true
        const incarnation = requireCurrentIncarnation ? process[endpoint] : null

        const stopReady = this.authManager.processManager.$inbound.subscribe(endpoint === "server" ? "/server-ready" : "/client-start", (identity: unknown) => {

            if (!active || identity !== process.identity || this.authManager.processManager.processes.get(process.identity) !== process || !this.expected.has(question)) return

            stop()

            this.requests.delete(question)

            this.deliver("host-end", "answer", question, succeeded([])).catch(() => undefined)
        })

        const stopExit = this.authManager.processManager.$inbound.subscribe("/exited", (payload: unknown) => {

            if (!active || !payload || typeof payload !== "object" || (payload as { reference?: unknown }).reference !== process.reference) return

            stop()

            this.requests.delete(question)

            this.deliver("host-end", "answer", question, failed(new Error(`The process ended before its ${endpoint} Endpoint became ready`))).catch(() => undefined)
        })

        const endpointStopped = (identity: unknown) => {

            if (!active || identity !== process.identity || this.authManager.processManager.processes.get(process.identity) !== process) return

            stop()

            this.requests.delete(question)

            this.deliver("host-end", "answer", question, failed(new Error(`The ${endpoint} Endpoint stopped before becoming ready`))).catch(() => undefined)
        }

        const stopEndpoint = requireCurrentIncarnation
            ? this.authManager.processManager.$inbound.subscribe(`/${endpoint}-stop`, endpointStopped)
            : () => undefined

        const stop = () => {

            if (!active) return

            active = false

            stopReady()

            stopExit()

            stopEndpoint()
        }

        this.requests.set(question, stop)

        if (incarnation && process[endpoint] !== incarnation) endpointStopped(process.identity)
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

        const existing = this.subscriptions.get(subscription)

        if (!existing) return

        if (this.owner && directSubscription(existing)) this.authManager.processManager.unsubscribeFrame(this.pane, this.owner, subscription).catch(() => undefined)

        this.subscriptions.delete(subscription)

        if (this.desktopPreferencesSubscriptions.delete(subscription) && this.desktopPreferencesSubscriptions.size === 0) {

            this.stopDesktopPreferences?.()

            this.stopDesktopPreferences = null
        }

        if (this.appearanceSubscriptions.delete(subscription) && this.appearanceSubscriptions.size === 0) {

            this.stopAppearance?.()

            this.stopAppearance = null
        }

        const key = JSON.stringify([existing.kind, existing.route, existing.event])

        const traffic = this.trafficSubscriptions.get(key)

        if (!traffic) return

        traffic.count--

        if (traffic.count > 0) return

        traffic.stop()

        this.trafficSubscriptions.delete(key)
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

            if (route === "end-host" && operation === "stream") return message[2] !== question

            if (route === "end-host" && operation === "ask") return message[4] !== question

            if (route === "end-host" && operation === "service-ask") return message[3] !== question

            return true
        })

        this.pending.splice(0, this.pending.length, ...remaining)
    }

    private resetEndpoint() {

        for (const stop of this.requests.values()) stop()

        this.requests.clear()

        if (this.owner) for (const [subscription, description] of this.subscriptions) {

            if (directSubscription(description)) this.authManager.processManager.unsubscribeFrame(this.pane, this.owner, subscription).catch(() => undefined)
        }

        this.subscriptions.clear()

        this.desktopPreferencesSubscriptions.clear()

        this.appearanceSubscriptions.clear()

        this.stopDesktopPreferences?.()

        this.stopDesktopPreferences = null

        this.stopAppearance?.()

        this.stopAppearance = null

        for (const { stop } of this.trafficSubscriptions.values()) stop()

        this.trafficSubscriptions.clear()

        this.systemSubscriptions.clear()

        this.expected.clear()

        this.waiting.clear()

        this.pending.length = 0
    }

}

function runEvent(authManager: AuthManager, value: unknown) {

    const event = value as { event?: unknown, process?: SdkProcessSource } | null

    if ((event?.event !== "started" && event?.event !== "exited") || !event.process) return value

    const program = authManager.programManager.programs.get(event.process.program)

    if (!program) throw new Error("The desktop does not know the Process Program")

    return { ...event, process: sdkProcess(event.process, program) }
}

const nativeAttachments = (value: unknown, transfer: readonly Transferable[]) => {

    const attachments: object[] = [...transfer]

    const known = new Set<object>(attachments)

    const visit = (entry: unknown) => {

        if (entry === null || typeof entry !== "object" || known.has(entry)) return

        known.add(entry)

        if (entry instanceof Blob) {

            attachments.push(entry)

            return
        }

        if (entry instanceof Date || entry instanceof RegExp || entry instanceof URL || entry instanceof Error || entry instanceof ArrayBuffer || ArrayBuffer.isView(entry)) return

        if (entry instanceof Map) {

            for (const [key, item] of entry) {

                visit(key)

                visit(item)
            }

            return
        }

        if (entry instanceof Set) {

            for (const item of entry) visit(item)

            return
        }

        for (const item of Array.isArray(entry) ? entry : Object.values(entry)) visit(item)
    }

    visit(value)

    return attachments
}

interface EndpointSubscription {

    kind: TrafficKind

    route: string

    event: string | null

    subject: string | null
}

function desktopPreferencesSubscription(subscription: EndpointSubscription) {

    return subscription.kind === "publish" && subscription.route === "host-desktop-preferences" && (subscription.event === null || subscription.event === "change")
}

function appearanceSubscription(subscription: EndpointSubscription) {

    return subscription.kind === "publish" && subscription.route === "host-appearance" && (subscription.event === null || subscription.event === "change")
}

function localPropertySubscription(subscription: EndpointSubscription) {

    return desktopPreferencesSubscription(subscription) || appearanceSubscription(subscription)
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

type EndpointReference = Readonly<{
    kind: "server" | "client"
    process: Readonly<{ program: { identity: string } }>
}>

function isEndpointReference(value: unknown): value is EndpointReference {

    if (!value || typeof value !== "object" || Array.isArray(value)) return false

    const reference = value as { kind?: unknown, process?: unknown }

    if (reference.kind !== "server" && reference.kind !== "client") return false
    if (!reference.process || typeof reference.process !== "object" || Array.isArray(reference.process)) return false

    const program = (reference.process as { program?: unknown }).program

    return !!program && typeof program === "object" && !Array.isArray(program) && typeof (program as { identity?: unknown }).identity === "string"
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
