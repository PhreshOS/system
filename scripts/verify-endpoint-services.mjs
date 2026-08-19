import assert from "node:assert/strict"
import EndpointServices from "../source/server/core/link-manager/auth-manager/process-manager/endpoint-services.ts"

function process(reference, program = "program") {
    return {
        reference,
        program: { identity: program },
        server: {},
        client: {}
    }
}

const services = new EndpointServices()
const provider = process("provider")
const conflicting = process("conflicting")
const key = { program: "program", endpoint: "server", name: "counter" }
const lifecycle = []
const publications = []
let disableTransportCompleted = false

assert.equal(services.disabled(key), true)
assert.equal(services.service(provider, "server"), null)

services.follow(key, "lifecycle", null, event => lifecycle.push(event))
services.follow(key, "lifecycle", "disable", async () => {
    await Promise.resolve()
    disableTransportCompleted = true
})

await services.enable(provider, "server", "counter")

assert.deepEqual(services.service(provider, "server"), key)
assert.equal(services.disabled(key), false)
assert.deepEqual(lifecycle, ["enable"])

// Subscriptions are future-only: joining after enable does not replay it.
const lateLifecycle = []
services.follow(key, "lifecycle", null, event => lateLifecycle.push(event))
assert.deepEqual(lateLifecycle, [])

await assert.rejects(() => services.enable(provider, "server", "other"), /already exposes/)
await assert.rejects(() => services.enable(conflicting, "server", "counter"), /already enabled/)

services.follow(key, "channel", "change", (_event, payload) => publications.push(payload))

await services.emit(provider, "server", "ignored", 1)
await services.emit(provider, "server", "change", 2)

assert.deepEqual(publications, [2])

await services.release(provider, "server")

assert.equal(services.disabled(key), true)
assert.deepEqual(lifecycle, ["enable", "disable"])
assert.deepEqual(lateLifecycle, ["disable"])
assert.equal(disableTransportCompleted, true)

// Once disabled, endpoint output is no longer mirrored into the service.
await services.emit(provider, "server", "change", 3)
assert.deepEqual(publications, [2])

// A later Endpoint incarnation may explicitly claim the same stable key.
await services.enable(conflicting, "server", "counter")
assert.deepEqual(lifecycle, ["enable", "disable", "enable"])
await services.release(conflicting, "server")

// Server and Client are distinct coordinates even under one Program and name.
await services.enable(provider, "client", "counter")
assert.equal(services.disabled({ ...key, endpoint: "client" }), false)
assert.equal(services.disabled(key), true)
await services.release(provider, "client")

provider.server = null
await assert.rejects(() => services.enable(provider, "server", "counter"), /not running/)
