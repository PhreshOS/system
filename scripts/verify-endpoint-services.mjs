import assert from "node:assert/strict"
import EndpointServices from "../source/server/core/link-manager/auth-manager/process-manager/endpoint-services.ts"
import Program from "../source/server/core/link-manager/auth-manager/program-manager/program.ts"

const privateProgram = new Program({
    identity: "private-program",
    server: { location: ".", startCommand: "true" }
})
const publicProgram = new Program({
    identity: "public-program",
    server: { location: ".", startCommand: "true", serviceDocs: "server-api.md" },
    client: { location: ".", serviceDocs: "client-api.md" }
})

assert.equal(privateProgram.record().server.hasService, false)
assert.equal(publicProgram.record().server.hasService, true)
assert.equal(publicProgram.record().client.hasService, true)
assert.throws(() => new Program({
    identity: "invalid-program",
    server: { location: ".", startCommand: "true", serviceDocs: "" }
}), /serviceDocs/)

function process(reference, program = "program", hasService = true) {
    return {
        reference,
        program: {
            identity: program,
            server: { serviceDocs: hasService ? "server-api.md" : undefined },
            client: { serviceDocs: hasService ? "client-api.md" : undefined }
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
const publications = []
let disableTransportCompleted = false

assert.equal(services.identity(key), services.identity({ ...key }))
assert.notEqual(services.identity(key), services.identity({ ...key, endpoint: "client" }))
assert.match(services.identity(key), /^[a-f0-9]{64}$/)
await assert.rejects(() => services.waitReady(key, -1), /non-negative finite number/)

assert.equal(services.enabled(key), false)
assert.equal(services.service(provider, "server"), null)
await assert.rejects(() => services.enable(privateEndpoint, "server", "counter"), /declared no Service documentation/)
await assert.rejects(() => services.enable(privateEndpoint, "client", "counter"), /declared no Service documentation/)

services.follow(key, "lifecycle", null, event => lifecycle.push(event))
services.follow(key, "lifecycle", "disable", async () => {
    await Promise.resolve()
    disableTransportCompleted = true
})

await services.enable(provider, "server", "counter")

assert.deepEqual(services.service(provider, "server"), key)
assert.equal(services.enabled(key), true)
assert.deepEqual(lifecycle, ["enable"])
await services.waitReady(key, 0)

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

assert.equal(services.enabled(key), false)
assert.deepEqual(lifecycle, ["enable", "disable"])
assert.deepEqual(lateLifecycle, ["disable"])
assert.equal(disableTransportCompleted, true)
await assert.rejects(() => services.waitReady(key, 0), /timeout/)

// Once disabled, endpoint output is no longer mirrored into the service.
await services.emit(provider, "server", "change", 3)
assert.deepEqual(publications, [2])

// Exact readiness observation does not require a global Service registry.
const ready = services.waitReady(key, 100)
await services.enable(conflicting, "server", "counter")
await ready
assert.deepEqual(lifecycle, ["enable", "disable", "enable"])
await services.release(conflicting, "server")

// Server and Client are distinct coordinates even under one Program and name.
await services.enable(provider, "client", "counter")
assert.equal(services.enabled({ ...key, endpoint: "client" }), true)
assert.equal(services.enabled(key), false)
await services.release(provider, "client")

await assert.rejects(() => services.enable(provider, "client", { name: "counter" }), /service name/)

provider.server = null
await assert.rejects(() => services.enable(provider, "server", "counter"), /not running/)
