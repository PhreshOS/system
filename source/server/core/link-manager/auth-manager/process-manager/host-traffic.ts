import { TheLink } from "@the-link/core"

/** Host announcements routed only into Process boundaries that requested them. */
export default class HostTraffic extends TheLink {

    public emitHost(domain: Domain, owner: HostOwner, event: string, subject: string, ...values: unknown[]) {

        return this.$inbound.publish(this.event(domain, null, event), { owner } satisfies HostDelivery, subject, ...values)
    }

    /** Emits an entity-scoped fact without also exposing it as a Host-registry event. */
    public emitSubject(domain: Domain, owner: HostOwner, event: string, subject: string, ...values: unknown[]) {

        return this.$inbound.publish(this.event(domain, subject, event), { owner } satisfies HostDelivery, subject, ...values)
    }

    public observe(domain: Domain, event: string | null, subject: string | null, subscriber: Subscriber) {

        const prefix = this.prefix(domain, subject)

        if (event !== null) return this.$inbound.subscribe(prefix + encodeURIComponent(event), (delivery, ...values) => subscriber(delivery as HostDelivery, event, ...values))

        return this.$inbound.forwardTo((word, delivery, ...values) => subscriber(delivery as HostDelivery, decodeURIComponent(word), ...values), prefix)
    }

    private prefix(domain: Domain, subject: string | null) {

        return subject === null ? `${domain}/all/` : `${domain}/subject/${encodeURIComponent(subject)}/`
    }

    private event(domain: Domain, subject: string | null, event: string) {

        return this.prefix(domain, subject) + encodeURIComponent(event)
    }
}

/**
 * The Program a fact belongs to, or `null` for a fact of the System itself, such as a connection.
 * Who may see a fact is decided from its owner, said when it happens and never looked up afterwards:
 * by then the entity may be gone, as an ended Process is when its ending is announced.
 */
export type HostOwner = string | null

/** What travels with every fact besides its values. */
export type HostDelivery = Readonly<{ owner: HostOwner }>

type Subscriber = (delivery: HostDelivery, event: string, ...values: unknown[]) => unknown

export type HostDomain = Domain

type Domain = "program" | "process" | "window" | "connection" | "session" | "service" | "permission" | "opening" | "log" | "programLog" | "clientMemory"
