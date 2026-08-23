import { isServiceKey, type ServiceKey } from "@phreshos/core"
import TheLink from "@libs/the-link/the-link"
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

        const declaration = endpoint === "server" ? process.program.server : process.program.client

        if (!declaration?.serviceable) throw new Error(`The ${endpoint} endpoint is not serviceable`)

        const definition = this.definition(value, endpoint)

        const { name } = definition

        if (!this.live(process, endpoint)) throw new Error(`The ${endpoint} endpoint is not running`)

        const owner = this.owner(process, endpoint)

        if (this.owners.has(owner)) throw new Error(`The ${endpoint} endpoint already exposes a service`)

        const key = Object.freeze({ program: process.program.identity, endpoint, name }) satisfies ServiceKey

        const identity = this.identity(key)

        if (this.bindings.has(identity)) throw new Error(`The "${name}" ${endpoint} service is already enabled for this Program`)

        this.bindings.set(identity, { key, process, endpoint, docs: definition.docs })

        this.owners.set(owner, identity)

        await Promise.all([
            this.$inbound.publish(this.event(key, "lifecycle", "enable"), "enable", undefined),
            this.$inbound.publish(this.registryEvent("enable"), "enable", key)
        ])

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

        await Promise.all([
            this.$inbound.publish(this.event(binding.key, "lifecycle", "disable"), "disable", undefined),
            this.$inbound.publish(this.registryEvent("disable"), "disable", binding.key)
        ])

        return true
    }

    public service(process: Process, endpoint: Half) {

        const identity = this.owners.get(this.owner(process, endpoint))

        return identity ? this.bindings.get(identity)?.key ?? null : null
    }

    public list() {

        return Object.freeze([...this.bindings.values()].map(binding => binding.key))
    }

    public enabled(key: unknown) {

        return this.bindings.has(this.identity(this.key(key)))
    }

    public async waitReady(key: unknown, timeout: unknown = 10_000) {

        const resolved = this.key(key)

        if (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout < 0) throw new Error("A service readiness timeout must be a non-negative finite number")

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
            const stop = this.$inbound.subscribe(this.registryEvent("enable"), (_event, enabled) => {

                if (this.identity(this.key(enabled)) === this.identity(resolved)) finish(resolve)
            })
            const timer = setTimeout(() => finish(() => reject(new Error("The service did not become ready before the timeout"))), timeout)

            if (this.enabled(resolved)) finish(resolve)
        })
    }

    public docs(key: unknown) {

        const resolved = this.key(key)

        if (resolved.endpoint !== "server") throw new Error("Only a Server service can provide API documentation")

        const binding = this.binding(resolved, "server")

        if (!binding) throw new Error("The service is disabled")

        return binding.docs
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

    public followRegistry(event: string | null, subscriber: Subscriber) {

        const prefix = "registry/"

        if (event !== null) {

            if (event !== "enable" && event !== "disable") throw new Error("A service registry event must be enable or disable")

            return this.$inbound.subscribe(this.registryEvent(event), (_word, key) => subscriber(event, key))
        }

        return this.$inbound.forwardTo((word, _event, key) => subscriber(decodeURIComponent(word), key), prefix)
    }

    private key(value: unknown) {

        if (!isServiceKey(value)) throw new Error("A complete service key is required")

        return value
    }

    private definition(value: unknown, endpoint: Half) {

        if (typeof value !== "object" || value === null) throw new Error("A service definition is required")

        const candidate = value as { name?: unknown, docs?: unknown }

        if (typeof candidate.name !== "string" || candidate.name.length === 0) throw new Error("A service name must be a non-empty string")

        if (candidate.docs !== undefined && typeof candidate.docs !== "string") throw new Error("Service documentation must be a string")

        if (endpoint === "client" && candidate.docs !== undefined) throw new Error("A Client service cannot provide API documentation")

        return { name: candidate.name, docs: endpoint === "server" ? candidate.docs ?? null : null }
    }

    private live(process: Process, endpoint: Half) {

        return endpoint === "server" ? process.server !== null : process.client !== null
    }

    private owner(process: Process, endpoint: Half) {

        return `${process.reference}:${endpoint}`
    }

    private identity(key: ServiceKey) {

        return JSON.stringify([key.program, key.endpoint, key.name])
    }

    private prefix(key: ServiceKey, scope: Scope) {

        return `${encodeURIComponent(key.program)}/${key.endpoint}/${encodeURIComponent(key.name)}/${scope}/`
    }

    private event(key: ServiceKey, scope: Scope, event: string) {

        return this.prefix(key, scope) + encodeURIComponent(event)
    }

    private registryEvent(event: string) {

        return `registry/${encodeURIComponent(event)}`
    }
}

export type ServiceScope = Scope

export type ServiceBinding = Binding

type Scope = "lifecycle" | "channel"

type Binding = Readonly<{

    key: ServiceKey

    process: Process

    endpoint: Half

    docs: string | null
}>

type Subscriber = (event: string, payload: unknown) => unknown
