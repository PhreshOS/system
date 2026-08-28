import TheLink from "@libs/the-link/the-link"
import ProcessTraffic, { type Half, type TrafficKind } from "./process-traffic"
import HostTraffic from "./host-traffic"
import EndpointEvents from "./endpoint-events"
import EndpointServices, { type ServiceScope } from "./endpoint-services"
import type { ServiceKey } from "@phreshos/core"
import Tunnel from "@libs/the-link/tunnel"
import messagepack from "@libs/messagepack"
import type { ServerRuntime, Stream } from "./server-runtime"

/**
 * The boundary around one server execution endpoint.
 *
 * The Server runtime speaks only here. Application events cross only when its SDK has
 * registered an interest. Readiness travels out of the endpoint; the boundary
 * never injects startup state into it.
 */
export default class ServerProcessBoundary extends TheLink {

    public ready = false

    private readonly clientDeclared: boolean

    private readonly subscriptions = new Map<string, EndpointSubscription>()

    private readonly expected = new Set<string>()

    private readonly waiting = new Map<string, WaitingQuestion[]>()

    // Every question addressed to this incarnation, including those already
    // delivered into its SDK. Teardown completes each one with an error so a
    // caller never waits for an endpoint that no longer exists.
    private readonly incoming = new Map<string, unknown[]>()

    private readonly requests = new Map<string, () => void>()

    private readonly observations = new Map<string, () => void>()

    private readonly endpointSubscriptions = new Map<string, () => void>()

    private readonly serviceSubscriptions = new Map<string, () => void>()

    private readonly hostSubscriptions = new Map<string, () => void>()

    private readonly appearanceSubscriptions = new Set<string>()

    private stopAppearance: (() => void) | null = null

    private readonly runtime: ServerRuntime

    private readonly hostTraffic: HostTraffic

    private readonly appearance: Tunnel

    private readonly unanswered: (values: unknown[], reason: string) => void

    public readonly finished: Promise<{ code: number | null, signal: NodeJS.Signals | null }>

    public constructor(runtime: ServerRuntime, clientDeclared: boolean, ended: Ending, unanswered: (values: unknown[], reason: string) => void, hostTraffic: HostTraffic, appearance: Tunnel) {

        super()

        this.clientDeclared = clientDeclared

        this.runtime = runtime

        runtime.onMessage(message => { this.receive(message).catch(() => undefined) })

        this.$outbound.forwardTo((event, ...values) => {

            runtime.send(messagepack.serialize([event, ...values]))
        })

        let finish!: (ending: { code: number | null, signal: NodeJS.Signals | null }) => void

        this.finished = new Promise(resolve => { finish = resolve })

        runtime.finished.then(async ({ code, signal }) => {

            try { await ended(code, signal) }

            finally { finish({ code, signal }) }
        }).catch(() => undefined)

        this.hostTraffic = hostTraffic

        this.appearance = appearance

        this.unanswered = unanswered

        this.$inbound.subscribe("boundary", (...values) => this.control(values))
    }

    /** Admit one binary envelope from this exact Server runtime. */
    private async receive(message: unknown) {

        let decoded: unknown

        try { decoded = messagepack.deserialize(receiveBytes(message)) }

        catch { return }

        if (!Array.isArray(decoded) || typeof decoded[0] !== "string") return

        const [event, ...values] = decoded as [string, ...unknown[]]

        await this.$inbound.publish(event, ...values)
    }

    /** Deliver one routed envelope only when this endpoint requested it. */
    public async deliver(route: string, ...values: unknown[]) {

        if (values[0] === "stream" && typeof values[1] === "string") {

            if (!this.expected.has(values[1])) return

            await this.$outbound.publish(route, ...values)

            return
        }

        if (values[0] === "answer" && typeof values[1] === "string") {

            if (!this.expected.has(values[1])) return

            this.requests.delete(values[1])

            await this.$outbound.publish(route, ...values)

            return
        }

        const question = values[0] === "wait" && typeof values[1] === "string" ? values[1] : null

        if (question && route === "end-end") this.incoming.set(question, values)

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

    public retain(question: string, stop: () => void) {

        this.requests.get(question)?.()

        this.requests.set(question, stop)
    }

    /** Observe another Process through a subscription owned by this boundary. */
    public observe(traffic: ProcessTraffic, subscription: string, target: string, half: Half, kind: TrafficKind, event: string | null, reportImpossible: boolean) {

        this.unobserve(subscription)

        const stop = traffic.observe(target, half, kind, event, (word, ...payload) => {

            const values = event === null ? [word, ...payload] : payload

            this.deliver("observed", subscription, ...values).catch(() => undefined)
        }, reportImpossible ? reason => this.impossible(subscription, reason) : undefined)

        this.observations.set(subscription, stop)
    }

    /** Terminate one asynchronous observation without affecting silent ones. */
    public impossible(subscription: string, reason: string) {

        this.unobserve(subscription)

        this.$outbound.publish("boundary", "impossible", subscription, reason).catch(() => undefined)
    }

    public unobserve(subscription: string) {

        this.observations.get(subscription)?.()

        this.observations.delete(subscription)
    }

    /** Follow destinationless events emitted by another Endpoint. */
    public follow(events: EndpointEvents, subscription: string, target: string, half: Half, event: string | null, reportImpossible: boolean) {

        this.unfollow(subscription)

        const stop = events.follow(target, half, event, (word, payload) => {

            const values = event === null ? [word, payload] : [payload]

            this.deliver("emitted", subscription, ...values).catch(() => undefined)
        }, reportImpossible ? reason => this.impossibleFollow(subscription, reason) : undefined)

        this.endpointSubscriptions.set(subscription, stop)
    }

    private impossibleFollow(subscription: string, reason: string) {

        this.$outbound.publish("boundary", "impossible", subscription, reason).catch(() => undefined)
    }

    public unfollow(subscription: string) {

        this.endpointSubscriptions.get(subscription)?.()

        this.endpointSubscriptions.delete(subscription)
    }

    /** Follow one exact service route for this boundary's lifetime. */
    public followService(services: EndpointServices, subscription: string, key: ServiceKey, scope: ServiceScope, event: string | null) {

        this.unfollowService(subscription)

        const stop = services.follow(key, scope, event, (word, payload) => {

            const values = event === null ? [word, payload] : [payload]

            return this.deliver("service-event", subscription, ...values).catch(() => undefined)
        })

        this.serviceSubscriptions.set(subscription, stop)
    }

    public unfollowService(subscription: string) {

        this.serviceSubscriptions.get(subscription)?.()

        this.serviceSubscriptions.delete(subscription)
    }

    /** Remove a question whether it is waiting here or inside the SDK. */
    public forget(question: string) {

        this.forgetWaiting(question)

        this.incoming.delete(question)

        this.$outbound.publish("boundary", "forget", question).catch(() => undefined)
    }

    public answered(question: string) {

        this.incoming.delete(question)
    }

    /** End every forwarding interest owned by this Process endpoint. */
    public release(reason = "The server endpoint stopped before answering") {

        for (const stop of this.requests.values()) stop()

        for (const stop of this.observations.values()) stop()

        for (const stop of this.endpointSubscriptions.values()) stop()

        for (const stop of this.serviceSubscriptions.values()) stop()

        for (const stop of this.hostSubscriptions.values()) stop()

        this.requests.clear()

        this.observations.clear()

        this.endpointSubscriptions.clear()

        this.serviceSubscriptions.clear()

        this.hostSubscriptions.clear()

        this.appearanceSubscriptions.clear()

        this.stopAppearance?.()

        this.stopAppearance = null

        this.subscriptions.clear()

        this.expected.clear()

        this.waiting.clear()

        const incoming = [...this.incoming.values()]

        this.incoming.clear()

        for (const values of incoming) this.unanswered(values, reason)
    }

    public stop() {

        this.runtime.stop()
    }

    public onOutput(listener: (stream: Stream, text: string) => void) {

        this.runtime.onOutput(listener)
    }

    private control(values: unknown[]) {

        const [operation, ...args] = values

        if (operation === "ready") {

            if (this.ready) return

            this.ready = true

            this.$inbound.publish("boundary-ready", true).catch(() => undefined)

            return
        }

        if (operation === "subscribe") {

            const [subscription, kind, route, event, subject, reportImpossible] = args

            if (typeof subscription !== "string" || !isTrafficKind(kind) || typeof route !== "string") return

            if (event !== null && typeof event !== "string") return

            if (subject !== null && typeof subject !== "string") return

            if (reportImpossible === true && route === "end-end" && !this.clientDeclared) {

                this.impossible(subscription, "This program declared no client half")

                return
            }

            this.removeSubscription(subscription)

            const description = { kind, route, event, subject }

            this.subscriptions.set(subscription, description)

            if (appearanceSubscription(description)) {

                this.appearanceSubscriptions.add(subscription)

                if (!this.stopAppearance) this.stopAppearance = this.appearance.subscribe("change", appearance => {

                    this.deliver("host-appearance", "change", appearance).catch(() => undefined)
                })

            }

            const hostDomain = route === "host-program" || route === "program-host" ? "program"
                : route === "host-process" || route === "program-process" || route === "process-host" ? "process"
                    : route === "host-end" ? "window"
                        : null

            if (hostDomain) {

                this.hostSubscriptions.get(subscription)?.()

                this.hostSubscriptions.set(subscription, this.hostTraffic.observe(hostDomain, event, subject, (_delivery, word, ...values) => {

                    this.deliver(route, word, ...values).catch(() => undefined)
                }))
            }

            if (kind === "ask") this.releaseWaiting(route, event)

            return
        }

        if (operation === "unsubscribe") {

            if (typeof args[0] === "string") {

                this.removeSubscription(args[0])
            }

            return
        }

        if (operation === "expect") {

            if (typeof args[0] === "string") this.expected.add(args[0])

            return
        }

        if (operation === "forget") {

            if (typeof args[0] !== "string") return

            this.expected.delete(args[0])

            this.requests.get(args[0])?.()

            this.requests.delete(args[0])

            this.forgetWaiting(args[0])
        }
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

    private removeSubscription(subscription: string) {

        this.subscriptions.delete(subscription)

        this.hostSubscriptions.get(subscription)?.()

        this.hostSubscriptions.delete(subscription)

        if (this.appearanceSubscriptions.delete(subscription) && this.appearanceSubscriptions.size === 0) {

            this.stopAppearance?.()

            this.stopAppearance = null
        }
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
}

interface EndpointSubscription {

    kind: TrafficKind

    route: string

    event: string | null

    subject: string | null
}

function appearanceSubscription(subscription: EndpointSubscription) {

    return subscription.kind === "publish" && subscription.route === "host-appearance" && (subscription.event === null || subscription.event === "change")
}

function isTrafficKind(value: unknown): value is TrafficKind {

    return value === "publish" || value === "ask" || value === "answer"
}

interface WaitingQuestion {

    route: string

    values: unknown[]

    question: string
}

export type { Stream } from "./server-runtime"

export type Ending = (code: number | null, signal: NodeJS.Signals | null) => void

function receiveBytes(value: unknown) {

    if (value instanceof Uint8Array) return Uint8Array.from(value)

    if (value instanceof ArrayBuffer) return new Uint8Array(value)

    if (ArrayBuffer.isView(value)) return Uint8Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))

    throw new TypeError("The server process message is not binary")
}
