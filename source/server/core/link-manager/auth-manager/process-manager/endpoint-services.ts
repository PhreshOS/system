import { isServiceKey, type ServiceKey } from "@phreshos/core"
import TheLink from "@libs/the-link/the-link"
import type Process from "./process"
import type { Half } from "./process-traffic"

/** Routes live Endpoint services without owning their lifecycle or state. */
export default class EndpointServices extends TheLink {

    public constructor(private readonly resolve: (key: ServiceKey) => ServiceTarget | null) {

        super()
    }

    public exists(key: unknown) {

        return this.target(key) !== null
    }

    public async waitReady(key: unknown, timeout: unknown = 10_000) {

        const resolved = this.key(key)

        if (resolved.endpoint !== "server") throw new Error("Only a Server service becomes ready")

        const milliseconds = serviceTimeout(timeout)

        await new Promise<void>((resolve, reject) => {

            let settled = false
            let stopReady: () => void = () => undefined

            const finish = (complete: () => void) => {

                if (settled) return

                settled = true
                clearTimeout(timer)
                stopStart()
                stopReady()
                complete()
            }

            const inspect = () => {

                stopReady()
                stopReady = () => undefined

                const target = this.resolve(resolved)

                if (!target?.process.server) return

                if (target.process.server.ready) return finish(resolve)

                stopReady = target.process.waitReady(() => finish(resolve))
            }

            const stopStart = this.$inbound.subscribe(this.event(resolved, "lifecycle", "start"), inspect)
            const timer = setTimeout(() => finish(() => reject(new Error("The service did not become ready before the timeout"))), milliseconds)

            inspect()
        })
    }

    public target(key: unknown, endpoint?: Half) {

        const resolved = this.key(key)
        const target = this.resolve(resolved)

        if (!target || endpoint && target.endpoint !== endpoint) return null

        return this.live(target.process, target.endpoint) ? target : null
    }

    /** Mirrors one service Endpoint emission into its identity and name routes. */
    public async emit(process: Process, endpoint: Half, event: string, payload: unknown) {

        if (!this.configured(process, endpoint)) return []

        return await Promise.all(this.keys(process, endpoint).map(key => (
            this.$inbound.publish(this.event(key, "events", event), event, payload)
        )))
    }

    /** Mirrors one service Endpoint start into its identity and name routes. */
    public async started(process: Process, endpoint: Half) {

        if (!this.configured(process, endpoint)) return []

        return await Promise.all(this.keys(process, endpoint).map(key => (
            this.$inbound.publish(this.event(key, "lifecycle", "start"), "start", undefined)
        )))
    }

    /** Mirrors one service Endpoint stop into its identity and name routes. */
    public async stopped(process: Process, endpoint: Half, service: boolean) {

        if (!service) return []

        return await Promise.all(this.keys(process, endpoint).map(key => (
            this.$inbound.publish(this.event(key, "lifecycle", "stop"), "stop", undefined)
        )))
    }

    public follow(key: unknown, scope: Scope, event: string | null, subscriber: Subscriber) {

        const resolved = this.key(key)

        if (scope !== "lifecycle" && scope !== "events") throw new Error("A service subscription scope is invalid")

        const prefix = this.prefix(resolved, scope)

        if (event !== null) return this.$inbound.subscribe(prefix + encodeURIComponent(event), (_word, payload) => subscriber(event, payload))

        return this.$inbound.forwardTo((_route, word, payload) => {

            if (typeof word === "string") return subscriber(word, payload)
        }, prefix)
    }

    private key(value: unknown) {

        if (!isServiceKey(value)) throw new Error("A complete service key is required")

        return value
    }

    private configured(process: Process, endpoint: Half) {

        return endpoint === "server" ? process.server?.service === true : process.client?.service === true
    }

    private live(process: Process, endpoint: Half) {

        return endpoint === "server" ? process.server !== null : process.client !== null
    }

    private keys(process: Process, endpoint: Half) {

        return [
            Object.freeze({ process: process.identity, endpoint }),
            Object.freeze({ program: process.program.identity, process: process.identity, endpoint }),
            ...process.name ? [Object.freeze({ program: process.program.identity, process: process.name, endpoint })] : []
        ] satisfies ServiceKey[]
    }

    private prefix(key: ServiceKey, scope: Scope) {

        return key.program === undefined
            ? `process/${encodeURIComponent(key.process)}/${key.endpoint}/${scope}/`
            : `program/${encodeURIComponent(key.program)}/${encodeURIComponent(key.process)}/${key.endpoint}/${scope}/`
    }

    private event(key: ServiceKey, scope: Scope, event: string) {

        return this.prefix(key, scope) + encodeURIComponent(event)
    }
}

export function serviceTimeout(value: unknown = 10_000) {

    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {

        throw new Error("A service readiness timeout must be a non-negative finite number")
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
