import TheLink from "@libs/the-link/the-link"

/** Host announcements routed only into Process boundaries that requested them. */
export default class HostTraffic extends TheLink {

    public async emit(event: string, publicSubject: string, scopedSubject: string, ...values: unknown[]) {

        const delivery = {}

        const deliveries = [
            this.$inbound.publish(this.event(null, event), delivery, publicSubject, ...values),
            this.$inbound.publish(this.event(scopedSubject, event), delivery, scopedSubject, ...values)
        ]

        await Promise.all(deliveries)
    }

    /** Emits a Process-scoped fact without also exposing it as a host event. */
    public emitSubject(event: string, subject: string, ...values: unknown[]) {

        return this.$inbound.publish(this.event(subject, event), {}, subject, ...values)
    }

    public observe(event: string | null, subject: string | null, subscriber: Subscriber) {

        const prefix = this.prefix(subject)

        if (event !== null) return this.$inbound.subscribe(prefix + encodeURIComponent(event), (delivery, ...values) => subscriber(delivery as object, event, ...values))

        return this.$inbound.forwardTo((word, delivery, ...values) => subscriber(delivery as object, decodeURIComponent(word), ...values), prefix)
    }

    private prefix(subject: string | null) {

        return subject === null ? "all/" : `subject/${encodeURIComponent(subject)}/`
    }

    private event(subject: string | null, event: string) {

        return this.prefix(subject) + encodeURIComponent(event)
    }
}

type Subscriber = (delivery: object, event: string, ...values: unknown[]) => unknown
