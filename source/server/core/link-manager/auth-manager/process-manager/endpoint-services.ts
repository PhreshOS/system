import { isServiceAddress, type ServiceAddress } from "@phreshos/core"
import { TheLink } from "@the-link/core"
import type Process from "./process"
import type { Half } from "./process-traffic"

/** Resolves and routes the Service view of named Endpoint execution contexts. */
export default class EndpointServices extends TheLink {

    private readonly active = new Set<string>()

    public constructor(
        private readonly resolve: (address: ServiceAddress) => ServiceTarget | null,
        private readonly processes: () => Iterable<Process>,
        private readonly changed: (event: "available" | "unavailable", address: ServiceAddress) => Promise<unknown> | unknown
    ) {

        super()
    }

    /** Returns the ready Service addresses currently represented by the model. */
    public list(name?: string) {

        const addresses: ServiceAddress[] = []

        for (const process of this.processes()) {

            if (process.name === null || name !== undefined && process.name !== name) continue

            for (const endpoint of ["server", "client"] as const) {

                const address = this.addressOf(process, endpoint)

                if (address && this.available(address)) addresses.push(address)
            }
        }

        return addresses
    }

    public available(value: unknown) {

        const address = this.address(value)
        const target = this.resolve(address)

        return target !== null && this.readyState(target.process, target.endpoint)
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

    public target(value: unknown, endpoint?: Half) {

        const address = this.address(value)
        const target = this.resolve(address)

        if (!target || endpoint && target.endpoint !== endpoint || !this.readyState(target.process, target.endpoint)) return null

        return target
    }

    /** Mirrors one application event through the Service's stable address. */
    public async emit(process: Process, endpoint: Half, event: string, payload: unknown) {

        const address = this.addressOf(process, endpoint)

        if (!address || !this.available(address)) return []

        return await this.$inbound.publish(this.event(address, "events", event), event, payload)
    }

    /** Re-evaluates Service availability after an Endpoint starts. */
    public started(process: Process, endpoint: Half) {

        return this.refresh(process, endpoint)
    }

    /** Re-evaluates Server Service availability after it signals readiness. */
    public ready(process: Process, endpoint: Half) {

        return this.refresh(process, endpoint)
    }

    /** Removes availability after a previously configured Service Endpoint stops. */
    public stopped(process: Process, endpoint: Half, service: boolean) {

        const address = service ? this.addressOf(process, endpoint, true) : null

        return address ? this.transition(address, false) : Promise.resolve([])
    }

    public follow(value: unknown, scope: Scope, event: string | null, subscriber: Subscriber) {

        const address = this.address(value)

        if (scope !== "lifecycle" && scope !== "events") throw new Error("A Service subscription scope is invalid")

        const prefix = this.prefix(address, scope)

        if (event !== null) return this.$inbound.subscribe(prefix + encodeURIComponent(event), (_word, payload) => subscriber(event, payload))

        return this.$inbound.forwardTo((_route, word, payload) => {

            if (typeof word === "string") return subscriber(word, payload)
        }, prefix)
    }

    private refresh(process: Process, endpoint: Half) {

        const address = this.addressOf(process, endpoint)

        if (!address) return Promise.resolve([])

        return this.transition(address, this.available(address))
    }

    private async transition(address: ServiceAddress, available: boolean) {

        const identity = this.identity(address)

        if (this.active.has(identity) === available) return []

        if (available) this.active.add(identity)
        else this.active.delete(identity)

        const event = available ? "available" : "unavailable"

        return await Promise.all([
            this.$inbound.publish(this.event(address, "lifecycle", event), event, undefined),
            this.changed(event, address)
        ])
    }

    private address(value: unknown) {

        if (!isServiceAddress(value)) throw new Error("A complete Service address is required")

        return Object.freeze({ program: value.program, process: value.process, endpoint: value.endpoint })
    }

    private addressOf(process: Process, endpoint: Half, previouslyConfigured = false): ServiceAddress | null {

        if (process.name === null || !previouslyConfigured && !this.configured(process, endpoint)) return null

        return Object.freeze({ program: process.program.identity, process: process.name, endpoint })
    }

    private configured(process: Process, endpoint: Half) {

        return endpoint === "server" ? process.server?.service === true : process.client?.service === true
    }

    private readyState(process: Process, endpoint: Half) {

        return endpoint === "server"
            ? process.server?.service === true && process.server.ready
            : process.client?.service === true
    }

    private identity(address: ServiceAddress) {

        return JSON.stringify([address.program, address.process, address.endpoint])
    }

    private prefix(address: ServiceAddress, scope: Scope) {

        return `program/${encodeURIComponent(address.program)}/${encodeURIComponent(address.process)}/${address.endpoint}/${scope}/`
    }

    private event(address: ServiceAddress, scope: Scope, event: string) {

        return this.prefix(address, scope) + encodeURIComponent(event)
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
