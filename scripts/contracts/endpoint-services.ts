import assert from "node:assert/strict"
import EndpointServices from "@server/core/link-manager/auth-manager/process-manager/endpoint-services"
import Program from "@server/core/link-manager/auth-manager/program-manager/program"
import type Process from "@server/core/link-manager/auth-manager/process-manager/process"
import type { ServiceKey } from "@phreshos/core"

const privateProgram = new Program({
    identity: "private-program",
    server: { location: ".", startCommand: "true" }
})
const documentedProgram = new Program({
    identity: "documented-program",
    agent: "agent.md",
    server: { location: ".", startCommand: "true" },
    client: { location: "." }
})

assert.equal(privateProgram.record().hasAgent, false)
assert.equal(documentedProgram.record().hasAgent, true)
assert.throws(() => new Program({
    identity: "invalid-program",
    agent: "",
    server: { location: ".", startCommand: "true" }
}), /agent documentation/)

const program = new Program({
    identity: "program",
    server: { location: ".", startCommand: "true" },
    client: { location: "." }
})

function process(identity: string, name: string | null, ready = true, service = true) {
    const waiters = new Set<() => void>()
    const server = { ready, service }
    return {
        identity,
        name,
        reference: `${identity}-reference`,
        program,
        launch: {
            server: { service },
            client: { service }
        },
        server,
        client: { service },
        waitReady(notify: () => void) {
            if (server.ready) notify()
            else waiters.add(notify)
            return () => { waiters.delete(notify) }
        },
        becomeReady() {
            server.ready = true
            for (const notify of waiters) notify()
            waiters.clear()
        }
    } as unknown as Process & { becomeReady(): void }
}

let provider = process("0b231437-513b-4907-8041-c497279c07fa", "main")

const services = new EndpointServices(key => {
    if (key.program !== undefined && key.program !== program.identity) return null
    if (key.program === undefined && key.process !== provider.identity) return null
    if (key.process !== provider.identity && key.process !== provider.name) return null
    if ((key.endpoint === "server" ? provider.server?.service : provider.client?.service) !== true) return null
    return { process: provider, endpoint: key.endpoint }
})

const key = { program: "program", process: "main", endpoint: "server" } satisfies ServiceKey
const exact = { ...key, process: provider.identity }
const global = { process: provider.identity, endpoint: "server" } satisfies ServiceKey
const lifecycle: string[] = []
const publications: unknown[] = []

await assert.rejects(() => services.waitReady(key, -1), /non-negative finite number/)

services.follow(key, "lifecycle", null, event => lifecycle.push(event))
services.follow(key, "events", "change", (_event, payload) => publications.push(payload))

await services.started(provider, "server")
assert.equal(services.exists(key), true)
assert.equal(services.exists(global), true)
assert.deepEqual(lifecycle, ["start"])
await services.waitReady(key, 0)

await services.emit(provider, "server", "ignored", 1)
await services.emit(provider, "server", "change", 2)
assert.deepEqual(publications, [2])

provider.server = null
await services.stopped(provider, "server", true)
assert.equal(services.exists(key), false)
assert.deepEqual(lifecycle, ["start", "stop"])
await assert.rejects(() => services.waitReady(key, 0), /timeout/)

// A name address follows a replacement, while an identity address does not.
provider = process("234448b9-4661-4bda-8028-ae75438bf5be", "main", false)
await services.started(provider, "server")
assert.equal(services.exists(key), true)
assert.equal(services.exists(exact), false)
assert.equal(services.exists(global), false)

const ready = services.waitReady(key, 100)
provider.becomeReady()
await ready

// Server and Client remain distinct coordinates for the same Process.
assert.equal(services.exists({ ...key, endpoint: "client" }), true)

const unconfiguredProgram = new Program({
    identity: "unconfigured",
    server: { location: ".", startCommand: "true" }
})
assert.equal(unconfiguredProgram.server?.service, false)

// One incarnation can override the Program default without changing the Program.
provider = process("2c6f42b0-7847-4f80-8373-0cba3f48636b", "main", true, false)
await services.started(provider, "server")
assert.equal(services.exists(key), false)
