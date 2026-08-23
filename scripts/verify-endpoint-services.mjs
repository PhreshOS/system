import assert from "node:assert/strict"
import EndpointServices from "../source/server/core/link-manager/auth-manager/process-manager/endpoint-services.ts"
import Program from "../source/server/core/link-manager/auth-manager/program-manager/program.ts"

const privateProgram = new Program({
    identity: "private-program",
    server: { location: ".", startCommand: "true" }
})
const publicProgram = new Program({
    identity: "public-program",
    server: { location: ".", startCommand: "true", serviceable: true },
    client: { location: ".", serviceable: true }
})

assert.equal(privateProgram.record().server.serviceable, false)
assert.equal(publicProgram.record().server.serviceable, true)
assert.equal(publicProgram.record().client.serviceable, true)
assert.throws(() => new Program({
    identity: "invalid-program",
    server: { location: ".", startCommand: "true", serviceable: "yes" }
}), /serviceable capability/)

function process(reference, program = "program", serviceable = true) {
    return {
        reference,
        program: {
            identity: program,
            server: { serviceable },
            client: { serviceable }
        },
        server: {},
        client: {}
    }
}

const services = new EndpointServices()
const provider = process("provider")
const conflicting = process("conflicting")
const privateEndpoint = process("private", "private", false)
const key = { program: "program", endpoint: "server", name: "counter" }
const lifecycle = []
const registry = []
const publications = []
let disableTransportCompleted = false

assert.equal(services.enabled(key), false)
assert.deepEqual(services.list(), [])
assert.equal(services.service(provider, "server"), null)
await assert.rejects(() => services.enable(privateEndpoint, "server", { name: "counter" }), /not serviceable/)
await assert.rejects(() => services.enable(privateEndpoint, "client", { name: "counter" }), /not serviceable/)

services.follow(key, "lifecycle", null, event => lifecycle.push(event))
services.followRegistry(null, (event, service) => registry.push([event, service]))
services.follow(key, "lifecycle", "disable", async () => {
    await Promise.resolve()
    disableTransportCompleted = true
})

await services.enable(provider, "server", { name: "counter", docs: "# Counter" })

assert.deepEqual(services.service(provider, "server"), key)
assert.equal(services.enabled(key), true)
assert.deepEqual(services.list(), [key])
assert.equal(services.docs(key), "# Counter")
assert.deepEqual(lifecycle, ["enable"])
assert.deepEqual(registry, [["enable", key]])
await services.waitReady(key, 0)

// Subscriptions are future-only: joining after enable does not replay it.
const lateLifecycle = []
services.follow(key, "lifecycle", null, event => lateLifecycle.push(event))
assert.deepEqual(lateLifecycle, [])

await assert.rejects(() => services.enable(provider, "server", { name: "other" }), /already exposes/)
await assert.rejects(() => services.enable(conflicting, "server", { name: "counter" }), /already enabled/)

services.follow(key, "channel", "change", (_event, payload) => publications.push(payload))

await services.emit(provider, "server", "ignored", 1)
await services.emit(provider, "server", "change", 2)

assert.deepEqual(publications, [2])

await services.release(provider, "server")

assert.equal(services.enabled(key), false)
assert.deepEqual(services.list(), [])
assert.throws(() => services.docs(key), /disabled/)
assert.deepEqual(lifecycle, ["enable", "disable"])
assert.deepEqual(lateLifecycle, ["disable"])
assert.equal(disableTransportCompleted, true)
assert.deepEqual(registry, [["enable", key], ["disable", key]])
await assert.rejects(() => services.waitReady(key, 0), /timeout/)

// Once disabled, endpoint output is no longer mirrored into the service.
await services.emit(provider, "server", "change", 3)
assert.deepEqual(publications, [2])

// A later Endpoint incarnation may explicitly claim the same stable key.
await services.enable(conflicting, "server", { name: "counter" })
assert.equal(services.docs(key), null)
assert.deepEqual(lifecycle, ["enable", "disable", "enable"])
await services.release(conflicting, "server")

// Server and Client are distinct coordinates even under one Program and name.
await services.enable(provider, "client", { name: "counter" })
assert.equal(services.enabled({ ...key, endpoint: "client" }), true)
assert.equal(services.enabled(key), false)
await services.release(provider, "client")

await assert.rejects(() => services.enable(provider, "client", { name: "counter", docs: "no" }), /cannot provide/)

provider.server = null
await assert.rejects(() => services.enable(provider, "server", { name: "counter" }), /not running/)
