import TheLink from "@libs/the-link/the-link"

/**
 * Application traffic spoken by one Process endpoint.
 *
 * Publications, questions and answers have independent routes. A boundary
 * joins only the kind it explicitly requested, so the separation exists at
 * the routing boundary rather than as filtering inside a Program endpoint.
 */
export default class ProcessTraffic extends TheLink {

    public emit(process: string, half: Half, kind: TrafficKind, event: string, ...message: unknown[]) {

        return this.$inbound.publish(this.event(process, half, kind, event), event, ...message)
    }

    /** End every fallible observation of this Process's application traffic. */
    public end(process: string, reason: string) {

        return this.$inbound.publish(this.terminal(process), reason)
    }

    public observe(process: string, half: Half, kind: TrafficKind, event: string | null, subscriber: Subscriber, impossible?: (reason: string) => void) {

        const prefix = this.prefix(process, half, kind)

        const stopEvent = event !== null
            ? this.$inbound.subscribe(prefix + encodeURIComponent(event), (word, ...payload) => {

                if (typeof word === "string") subscriber(word, ...payload)
            })
            : this.$inbound.forwardTo((_route, word, ...payload) => {

                if (typeof word === "string") subscriber(word, ...payload)
            }, prefix)

        const stopTerminal = impossible
            ? this.$inbound.subscribe(this.terminal(process), (reason: unknown) => impossible(String(reason)))
            : () => undefined

        return () => {

            stopEvent()

            stopTerminal()
        }
    }

    private terminal(process: string) {

        return `terminal/${encodeURIComponent(process)}`
    }

    private prefix(process: string, half: Half, kind: TrafficKind) {

        return `${encodeURIComponent(process)}/${half}/${kind}/`
    }

    private event(process: string, half: Half, kind: TrafficKind, event: string) {

        return this.prefix(process, half, kind) + encodeURIComponent(event)
    }
}

export type Half = "server" | "client"

export type TrafficKind = "publish" | "ask" | "answer"

type Subscriber = (event: string, ...payload: unknown[]) => unknown
