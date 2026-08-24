import { isServiceKey, type ServiceKey } from "@phreshos/core"
import TheLink from "@libs/the-link/the-link"
import { createHash } from "node:crypto"
import type Process from "./process"
import type { Half } from "./process-traffic"

/**
 * Authoritative runtime bindings for explicitly named public Endpoint services.
 *
 * A key survives absence conceptually, but a binding never does: it points to
 * one live Endpoint incarnation and is removed with that incarnation. Routes
 * retain no value and deliver only to exact live interests.
 */
export default class EndpointServices extends TheLink {

    private readonly bindings = new Map<string, Binding>()

    private readonly owners = new Map<string, string>()

    public async enable(process: Process, endpoint: Half, value: unknown) {

        const name = this.name(value)

        if (!this.live(process, endpoint)) throw new Error(`The ${endpoint} endpoint is not running`)

        const owner = this.owner(process, endpoint)

        if (this.owners.has(owner)) throw new Error(`The ${endpoint} endpoint already exposes a service`)

        const key = Object.freeze({ program: process.program.identity, endpoint, name }) satisfies ServiceKey

        const identity = this.identity(key)

        if (this.bindings.has(identity)) throw new Error(`The "${name}" ${endpoint} service is already enabled for this Program`)

        this.bindings.set(identity, { key, process, endpoint })

        this.owners.set(owner, identity)

        await this.$inbound.publish(this.event(key, "lifecycle", "enable"), "enable", undefined)

        return key
    }

    public async disable(process: Process, endpoint: Half) {

        const disabled = await this.release(process, endpoint)

        if (!disabled) throw new Error(`The ${endpoint} endpoint exposes no service`)
    }

    /** Removes a binding owned by one exact Endpoint without treating absence as an error. */
    public async release(process: Process, endpoint: Half) {

        const owner = this.owner(process, endpoint)

        const identity = this.owners.get(owner)

        if (!identity) return false

        const binding = this.bindings.get(identity)

        this.owners.delete(owner)

        if (!binding || binding.process !== process || binding.endpoint !== endpoint) return false

        this.bindings.delete(identity)

        await this.$inbound.publish(this.event(binding.key, "lifecycle", "disable"), "disable", undefined)

        return true
    }

    public service(process: Process, endpoint: Half) {

        const identity = this.owners.get(this.owner(process, endpoint))

        return identity ? this.bindings.get(identity)?.key ?? null : null
    }

    public enabled(key: unknown) {

        return this.bindings.has(this.identity(this.key(key)))
    }

    public async waitReady(key: unknown, timeout: unknown = 10_000) {

        const resolved = this.key(key)
        const milliseconds = serviceTimeout(timeout)

        if (this.enabled(resolved)) return

        await new Promise<void>((resolve, reject) => {

            let settled = false

            const finish = (complete: () => void) => {

                if (settled) return

                settled = true
                clearTimeout(timer)
                stop()
                complete()
            }
            const stop = this.$inbound.subscribe(this.event(resolved, "lifecycle", "enable"), () => finish(resolve))
            const timer = setTimeout(() => finish(() => reject(new Error("The service did not become ready before the timeout"))), milliseconds)

            if (this.enabled(resolved)) finish(resolve)
        })
    }

    public binding(key: unknown, endpoint?: Half) {

        const binding = this.bindings.get(this.identity(this.key(key))) ?? null

        return binding && (!endpoint || binding.endpoint === endpoint) && this.live(binding.process, binding.endpoint)
            ? binding
            : null
    }

    /** Mirrors one Endpoint emission into its service route only while enabled. */
    public emit(process: Process, endpoint: Half, event: string, payload: unknown) {

        const key = this.service(process, endpoint)

        if (!key) return Promise.resolve([])

        return this.$inbound.publish(this.event(key, "channel", event), event, payload)
    }

    public follow(key: unknown, scope: Scope, event: string | null, subscriber: Subscriber) {

        const resolved = this.key(key)

        if (scope !== "lifecycle" && scope !== "channel") throw new Error("A service subscription scope is invalid")

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

    private name(value: unknown) {

        if (typeof value !== "string" || value.length === 0) throw new Error("A service name must be a non-empty string")

        return value
    }

    private live(process: Process, endpoint: Half) {

        return endpoint === "server" ? process.server !== null : process.client !== null
    }

    private owner(process: Process, endpoint: Half) {

        return `${process.reference}:${endpoint}`
    }

    /** Stable internal identity of one exact Service coordinate tuple. */
    public identity(value: unknown) {

        const key = this.key(value)

        return createHash("sha256")
            .update(JSON.stringify([key.program, key.endpoint, key.name]))
            .digest("hex")
    }

    private prefix(key: ServiceKey, scope: Scope) {

        return `${encodeURIComponent(key.program)}/${key.endpoint}/${encodeURIComponent(key.name)}/${scope}/`
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

export type ServiceBinding = Binding

type Scope = "lifecycle" | "channel"

type Binding = Readonly<{

    key: ServiceKey

    process: Process

    endpoint: Half
}>

type Subscriber = (event: string, payload: unknown) => unknown
