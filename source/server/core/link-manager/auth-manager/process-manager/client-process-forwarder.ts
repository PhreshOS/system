import AuthManager from "../auth-manager"
import ProcessTraffic, { type Half, type TrafficKind } from "./process-traffic"
import EndpointEvents from "./endpoint-events"
import EndpointServices, { type ServiceScope } from "./endpoint-services"
import type { ServiceKey } from "@phreshos/core"

/**
 * Server-host counterpart of one client Process boundary lease.
 *
 * The desktop boundary owns the subscription semantically. This small relay
 * retains only the transport forwarding needed to reach that exact connection,
 * pane and document, and releases every interest with that lease.
 */
export default class ClientProcessForwarder {

    public readonly connection: string

    public readonly pane: string

    public readonly owner: string

    private readonly authManager: AuthManager

    private readonly traffic: ProcessTraffic

    private readonly endpointEvents: EndpointEvents

    private readonly observations = new Map<string, () => void>()

    private readonly endpointSubscriptions = new Map<string, () => void>()

    private readonly serviceSubscriptions = new Map<string, () => void>()

    private readonly requests = new Map<string, () => void>()

    private readonly subscriptions = new Map<string, string | null>()

    private readonly shapeObservedValues: (values: unknown[]) => unknown[]

    public constructor(connection: string, pane: string, owner: string, authManager: AuthManager, traffic: ProcessTraffic, endpointEvents: EndpointEvents, shapeObservedValues: (values: unknown[]) => unknown[]) {

        this.connection = connection

        this.pane = pane

        this.owner = owner

        this.authManager = authManager

        this.traffic = traffic

        this.endpointEvents = endpointEvents

        this.shapeObservedValues = shapeObservedValues
    }

    public observe(subscription: string, target: string, half: Half, kind: TrafficKind, event: string | null, reportImpossible: boolean) {

        this.unobserve(subscription)

        const stop = this.traffic.observe(target, half, kind, event, (word, ...payload) => {

            const values = this.shapeObservedValues(event === null ? [word, ...payload] : payload)

            this.authManager.publishToConnection(this.connection, "/process/observed", this.pane, this.owner, subscription, values).catch(() => undefined)
        }, reportImpossible ? reason => this.impossible(subscription, reason) : undefined)

        this.observations.set(subscription, stop)
    }

    public impossible(subscription: string, reason: string) {

        this.unobserve(subscription)

        this.authManager.publishToConnection(this.connection, "/process/impossible", this.pane, this.owner, subscription, reason).catch(() => undefined)
    }

    public unobserve(subscription: string) {

        this.observations.get(subscription)?.()

        this.observations.delete(subscription)
    }

    /** Retains one live inbound Context publication interest for this exact client lease. */
    public subscribe(subscription: string, event: string | null) {

        this.subscriptions.set(subscription, event)
    }

    public unsubscribe(subscription: string) {

        this.subscriptions.delete(subscription)
    }

    /** Forward ordinary publications only when this lease asked for them. */
    public async forward(values: unknown[]) {

        const event = values[0]

        if (typeof event !== "string" || ![...this.subscriptions.values()].some(registered => registered === null || registered === event)) return

        await this.send(values)
    }

    /** Complete only a question retained by this exact client lease. */
    public answer(question: string, values: unknown[]) {

        if (!this.requests.has(question)) return false

        this.requests.delete(question)

        this.send(values).catch(() => undefined)

        return true
    }

    public follow(subscription: string, target: string, half: Half, event: string | null, reportImpossible: boolean) {

        this.unfollow(subscription)

        const stop = this.endpointEvents.follow(target, half, event, (word, payload) => {

            const values = event === null ? [word, payload] : [payload]

            this.authManager.publishToConnection(this.connection, "/process/emitted", this.pane, this.owner, subscription, values).catch(() => undefined)
        }, reportImpossible ? reason => this.impossibleFollow(subscription, reason) : undefined)

        this.endpointSubscriptions.set(subscription, stop)
    }

    private impossibleFollow(subscription: string, reason: string) {

        this.authManager.publishToConnection(this.connection, "/process/impossible", this.pane, this.owner, subscription, reason).catch(() => undefined)
    }

    public unfollow(subscription: string) {

        this.endpointSubscriptions.get(subscription)?.()

        this.endpointSubscriptions.delete(subscription)
    }

    public followService(services: EndpointServices, subscription: string, key: ServiceKey, scope: ServiceScope, event: string | null) {

        this.unfollowService(subscription)

        const stop = services.follow(key, scope, event, (word, payload) => {

            const values = event === null ? [word, payload] : [payload]

            return this.authManager.publishToConnection(this.connection, "/process/service-event", this.pane, this.owner, subscription, values).catch(() => undefined)
        })

        this.serviceSubscriptions.set(subscription, stop)
    }

    public unfollowService(subscription: string) {

        this.serviceSubscriptions.get(subscription)?.()

        this.serviceSubscriptions.delete(subscription)
    }

    public retain(question: string, stop: () => void) {

        this.requests.get(question)?.()

        this.requests.set(question, stop)
    }

    public cancel(question: string) {

        this.requests.get(question)?.()

        this.requests.delete(question)
    }

    public forget(question: string) {

        this.requests.delete(question)
    }

    public release() {

        for (const stop of this.observations.values()) stop()

        for (const stop of this.endpointSubscriptions.values()) stop()

        for (const stop of this.serviceSubscriptions.values()) stop()

        for (const stop of this.requests.values()) stop()

        this.observations.clear()

        this.endpointSubscriptions.clear()

        this.serviceSubscriptions.clear()

        this.requests.clear()

        this.subscriptions.clear()
    }

    private async send(values: unknown[]) {

        await this.authManager.publishToConnection(this.connection, "/process/end-end", this.pane, values)
    }
}
