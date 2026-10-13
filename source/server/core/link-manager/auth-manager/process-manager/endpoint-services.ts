import { isServiceAddress, type ServiceAddress } from "@phreshos/core"
import { TheLink } from "@the-link/core"
import type Process from "./process"
import type { Half } from "./process-traffic"

/**
 * The Services of running Endpoints, by their names. A Service name is public across the System and
 * held by one Endpoint at a time; a caller reaches it by the name, of a kind it names or of either.
 * Who holds it stays out of sight.
 */
export default class EndpointServices extends TheLink {

    /** The names whose holder is ready, and the kind of Endpoint holding each. */
    private readonly active = new Map<string, Half>()

    public constructor(private readonly processes: () => Iterable<Process>) {

        super()
    }

    /** The Endpoint holding a Service name, of any kind, while it runs. */
    public holder(name: string): ServiceTarget | null {

        for (const process of this.processes()) {

            if (process.server?.service === name) return { process, endpoint: "server" }

            if (process.client?.service === name) return { process, endpoint: "client" }
        }

        return null
    }

    public available(value: unknown) {

        return this.target(value) !== null
    }

    public async waitReady(value: unknown, timeout: unknown = 10_000, signal?: AbortSignal) {

        const address = this.address(value)
        const milliseconds = serviceTimeout(timeout)

        if (this.available(address)) return

        await new Promise<void>((resolve, reject) => {

            let settled = false
            let stop: () => void = () => undefined

            const finish = (complete: () => void) => {

                if (settled) return

                settled = true
                clearTimeout(timer)
                stop()
                signal?.removeEventListener("abort", abort)
                complete()
            }

            const abort = () => finish(() => reject(signal?.reason instanceof Error ? signal.reason : new Error("Waiting for the Service was cancelled")))
            const timer = setTimeout(() => finish(() => reject(new Error("The Service did not become available before the timeout"))), milliseconds)

            stop = this.follow(address, "lifecycle", "available", () => finish(resolve))
            signal?.addEventListener("abort", abort, { once: true })

            if (signal?.aborted) abort()
            else if (this.available(address)) finish(resolve)
        })
    }

    /**
     * The ready Endpoint holding an address's name, when it is of the kind the address names, and of the
     * kind the caller needs, such as a Server for a question.
     */
    public target(value: unknown, needed?: Half) {

        const address = this.address(value)
        const target = this.holder(address.name)

        if (!target || address.endpoint && target.endpoint !== address.endpoint || needed && target.endpoint !== needed) return null

        return this.readyState(target.process, target.endpoint) ? target : null
    }

    /** Mirrors one application event of a Service's holder to everyone following its name. */
    public async emit(process: Process, endpoint: Half, event: string, payload: unknown) {

        const name = this.nameOf(process, endpoint)

        if (name === false || this.active.get(name) !== endpoint) return []

        return await Promise.all(this.routes(name, endpoint, "events").map(route => this.$inbound.publish(route + encodeURIComponent(event), event, payload)))
    }

    /** Re-evaluates a name after its Endpoint starts. */
    public started(process: Process, endpoint: Half) {

        return this.refresh(process, endpoint)
    }

    /** Re-evaluates a name after its Server signals readiness. */
    public ready(process: Process, endpoint: Half) {

        return this.refresh(process, endpoint)
    }

    /** Lets a name go after the Endpoint that held it stops. */
    public stopped(endpoint: Half, service: string | false) {

        return service !== false && this.active.get(service) === endpoint ? this.transition(service, endpoint, false) : Promise.resolve([])
    }

    public follow(value: unknown, scope: Scope, event: string | null, subscriber: Subscriber, permitted: () => boolean = () => true) {

        const address = this.address(value)

        if (scope !== "lifecycle" && scope !== "events") throw new Error("A Service subscription scope is invalid")

        const prefix = this.prefix(address.name, address.endpoint ?? "any", scope)
        // The subscribing boundary supplies current authority; checking it at
        // this local fan-out point keeps revocation live without a transport
        // round-trip for every event.
        if (event !== null) return this.$inbound.subscribe(prefix + encodeURIComponent(event), (_word, payload) => {

            if (permitted()) return subscriber(event, payload)
        })

        return this.$inbound.forwardTo((_route, word, payload) => {

            if (typeof word === "string" && permitted()) return subscriber(word, payload)
        }, prefix)
    }

    private refresh(process: Process, endpoint: Half) {

        const name = this.nameOf(process, endpoint)

        if (name === false) return Promise.resolve([])

        return this.transition(name, endpoint, this.readyState(process, endpoint))
    }

    private async transition(name: string, endpoint: Half, available: boolean) {

        if ((this.active.get(name) === endpoint) === available) return []

        if (available) this.active.set(name, endpoint)
        else this.active.delete(name)

        const event = available ? "available" : "unavailable"

        // Heard by whoever follows the name for this kind, and by whoever follows it for either.
        return await Promise.all(this.routes(name, endpoint, "lifecycle").map(route => this.$inbound.publish(route + event, event, undefined)))
    }

    private address(value: unknown): ServiceAddress {

        if (!isServiceAddress(value)) throw new Error("A Service is reached by its name, such as file-picker-v1, and optionally the kind of Endpoint")

        return Object.freeze({ name: value.name, ...(value.endpoint === undefined ? {} : { endpoint: value.endpoint }) })
    }

    private nameOf(process: Process, endpoint: Half): string | false {

        return (endpoint === "server" ? process.server?.service : process.client?.service) ?? false
    }

    private readyState(process: Process, endpoint: Half) {

        return endpoint === "server" ? process.server?.service !== false && process.server?.ready === true : process.client?.service !== false && process.client !== null
    }

    /** The routes an event of a name's holder travels: for its own kind, and for either kind. */
    private routes(name: string, endpoint: Half, scope: Scope) {

        return [this.prefix(name, endpoint, scope), this.prefix(name, "any", scope)]
    }

    private prefix(name: string, kind: Half | "any", scope: Scope) {

        return `service/${encodeURIComponent(name)}/${kind}/${scope}/`
    }
}

export function serviceTimeout(value: unknown = 10_000) {

    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {

        throw new Error("A Service readiness timeout must be a non-negative finite number")
    }

    return value
}

export type ServiceScope = Scope

type ServiceTarget = Readonly<{
    process: Process
    endpoint: Half
}>

type Scope = "lifecycle" | "events"

type Subscriber = (event: string, payload: unknown) => unknown
