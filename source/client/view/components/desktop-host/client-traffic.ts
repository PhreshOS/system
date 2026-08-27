import TheLink from "@libs/the-link/the-link"
import { type TrafficKind } from "@server/core/link-manager/auth-manager/process-manager/process-traffic"

/** Desktop-local traffic routed only to subscribed client Process boundaries. */
export default class ClientTraffic extends TheLink {

    public emit(pane: string, route: string, ...values: unknown[]) {

        const asking = values[0] === "wait"

        const kind: TrafficKind = asking ? "ask" : "publish"

        const eventIndex = route === "end-end" ? 3 : 2

        const event = asking && typeof values[eventIndex] === "string" ? values[eventIndex] : values[0]

        if (typeof event !== "string") return Promise.resolve([])

        return this.$inbound.publish(this.event(pane, route, kind, event), {}, ...values)
    }

    public observe(pane: string, route: string, kind: TrafficKind, event: string | null, subscriber: Subscriber) {

        const prefix = this.prefix(pane, route, kind)

        if (event !== null) return this.$inbound.subscribe(prefix + encodeURIComponent(event), (delivery, ...values) => subscriber(delivery as object, ...values))

        return this.$inbound.forwardTo((_event, delivery, ...values) => subscriber(delivery as object, ...values), prefix)
    }

    private prefix(pane: string, route: string, kind: TrafficKind) {

        return `${encodeURIComponent(pane)}/${encodeURIComponent(route)}/${kind}/`
    }

    private event(pane: string, route: string, kind: TrafficKind, event: string) {

        return this.prefix(pane, route, kind) + encodeURIComponent(event)
    }
}

type Subscriber = (delivery: object, ...values: unknown[]) => unknown
