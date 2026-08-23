import TheLink from "@libs/the-link/the-link"

/** Host announcements routed only into Process boundaries that requested them. */
export default class HostTraffic extends TheLink {

    public emitHost(domain: Domain, event: string, subject: string, ...values: unknown[]) {

        return this.$inbound.publish(this.event(domain, null, event), {}, subject, ...values)
    }

    public async emit(domain: Domain, event: string, publicSubject: string, scopedSubject: string, ...values: unknown[]) {

        const delivery = {}

        const deliveries = [
            this.$inbound.publish(this.event(domain, null, event), delivery, publicSubject, ...values),
            this.$inbound.publish(this.event(domain, scopedSubject, event), delivery, scopedSubject, ...values)
        ]

        await Promise.all(deliveries)
    }

    /** Emits an entity-scoped fact without also exposing it as a Host-registry event. */
    public emitSubject(domain: Domain, event: string, subject: string, ...values: unknown[]) {

        return this.$inbound.publish(this.event(domain, subject, event), {}, subject, ...values)
    }

    public observe(domain: Domain, event: string | null, subject: string | null, subscriber: Subscriber) {

        const prefix = this.prefix(domain, subject)

        if (event !== null) return this.$inbound.subscribe(prefix + encodeURIComponent(event), (delivery, ...values) => subscriber(delivery as object, event, ...values))

        return this.$inbound.forwardTo((word, delivery, ...values) => subscriber(delivery as object, decodeURIComponent(word), ...values), prefix)
    }

    private prefix(domain: Domain, subject: string | null) {

        return subject === null ? `${domain}/all/` : `${domain}/subject/${encodeURIComponent(subject)}/`
    }

    private event(domain: Domain, subject: string | null, event: string) {

        return this.prefix(domain, subject) + encodeURIComponent(event)
    }
}

type Subscriber = (delivery: object, event: string, ...values: unknown[]) => unknown

export type HostDomain = Domain

type Domain = "program" | "process" | "window"
