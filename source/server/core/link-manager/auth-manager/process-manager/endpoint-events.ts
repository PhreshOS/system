import TheLink from "@libs/the-link/the-link"
import { type Half } from "./process-traffic"

/**
 * Destinationless application events emitted by Process endpoints.
 *
 * Unlike ProcessTraffic, these routes have no destination metadata: the
 * Endpoint is the source being followed, and only explicit followers join its
 * route. Endpoint incarnation changes do not end a route; Process exit does.
 */
export default class EndpointEvents extends TheLink {

    public emit(process: string, half: Half, event: string, payload: unknown) {

        return this.$inbound.publish(this.event(process, half, event), event, payload)
    }

    /** End every fallible subscription to this Process's Endpoint events. */
    public end(process: string, reason: string) {

        return this.$inbound.publish(this.terminal(process), reason)
    }

    public follow(process: string, half: Half, event: string | null, subscriber: Subscriber, impossible?: (reason: string) => void) {

        const prefix = this.prefix(process, half)

        const stopEvent = event !== null
            ? this.$inbound.subscribe(prefix + encodeURIComponent(event), (_word, payload) => subscriber(event, payload))
            : this.$inbound.forwardTo((_route, word, payload) => {

                if (typeof word === "string") subscriber(word, payload)
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

    private prefix(process: string, half: Half) {

        return `${encodeURIComponent(process)}/${half}/`
    }

    private event(process: string, half: Half, event: string) {

        return this.prefix(process, half) + encodeURIComponent(event)
    }
}

type Subscriber = (event: string, payload: unknown) => unknown
