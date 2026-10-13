import assert from "node:assert/strict"
import EndpointServices from "@server/core/link-manager/auth-manager/process-manager/endpoint-services"
import Program from "@server/core/link-manager/auth-manager/program-manager/program"
import type Process from "@server/core/link-manager/auth-manager/process-manager/process"
import { test } from "vitest"

const program = new Program({
    identity: "program",
    server: { location: ".", command: "true" },
    client: { location: "." }
})

/** A Process whose Endpoints hold the Service names given, a Process name of its own beside them. */
function process(identity: string, server: string | false, client: string | false = false, ready = true) {
    const serverState = { ready, service: server }
    return {
        identity,
        name: "local",
        reference: `${identity}-reference`,
        program,
        server: serverState,
        client: { service: client },
        becomeReady() { serverState.ready = true }
    } as unknown as Process & { becomeReady(): void }
}

test("a Service is reached by its name, of the kind asked for or either, whatever its Process is named", async () => {
    let running = [process("first", "file-picker-v1")]
    const services = new EndpointServices(() => running)
    const lifecycle: string[] = []
    const anyLifecycle: string[] = []
    const publications: unknown[] = []
    const anyPublications: unknown[] = []
    const authorizedPublications: unknown[] = []
    let permitted = true

    assert.throws(() => services.available({ program: "program", process: "local", endpoint: "server" }), /reached by its name/)
    await assert.rejects(() => services.waitReady({ name: "file-picker-v1" }, -1), /non-negative finite number/)

    services.follow({ name: "file-picker-v1", endpoint: "server" }, "lifecycle", null, event => lifecycle.push(event))
    services.follow({ name: "file-picker-v1" }, "lifecycle", null, event => anyLifecycle.push(event))
    services.follow({ name: "file-picker-v1", endpoint: "server" }, "events", "change", (_event, payload) => publications.push(payload))
    services.follow({ name: "file-picker-v1" }, "events", "change", (_event, payload) => anyPublications.push(payload))
    services.follow({ name: "file-picker-v1" }, "events", "authorized", (_event, payload) => authorizedPublications.push(payload), () => permitted)

    await services.started(running[0]!, "server")
    assert.equal(services.available({ name: "file-picker-v1" }), true)
    assert.equal(services.available({ name: "file-picker-v1", endpoint: "server" }), true)
    // Held by a Server, it is no Client's.
    assert.equal(services.available({ name: "file-picker-v1", endpoint: "client" }), false)
    assert.equal(services.target({ name: "file-picker-v1" }, "server")?.process, running[0])
    assert.deepEqual(lifecycle, ["available"])
    assert.deepEqual(anyLifecycle, ["available"])
    await services.waitReady({ name: "file-picker-v1", endpoint: "server" }, 0)

    await services.emit(running[0]!, "server", "change", 2)
    assert.deepEqual(publications, [2])
    assert.deepEqual(anyPublications, [2])

    await services.emit(running[0]!, "server", "authorized", 3)
    permitted = false
    await services.emit(running[0]!, "server", "authorized", 4)
    permitted = true
    assert.deepEqual(authorizedPublications, [3])

    const ended = running[0]!
    running = []
    await services.stopped("server", ended.server!.service)
    assert.equal(services.available({ name: "file-picker-v1" }), false)
    assert.deepEqual(lifecycle, ["available", "unavailable"])
    await assert.rejects(() => services.waitReady({ name: "file-picker-v1" }, 0), /timeout|available/)

    // The same name reaches its next holder, another Process altogether, once it is ready.
    running = [process("next", "file-picker-v1", false, false)]
    await services.started(running[0]!, "server")
    assert.equal(services.available({ name: "file-picker-v1" }), false)
    const ready = services.waitReady({ name: "file-picker-v1" }, 100)
    running[0]!.becomeReady()
    await services.ready(running[0]!, "server")
    await ready
    assert.equal(services.holder("file-picker-v1")?.process, running[0])
})

test("a Client holds a name as a Server does, and an Endpoint with none is reached by no name", async () => {
    const running = [process("canvas", false, "board-canvas-v1")]
    const services = new EndpointServices(() => running)

    await services.started(running[0]!, "client")
    assert.equal(services.available({ name: "board-canvas-v1", endpoint: "client" }), true)
    assert.equal(services.available({ name: "board-canvas-v1", endpoint: "server" }), false)
    // A question needs a Server.
    assert.equal(services.target({ name: "board-canvas-v1" }, "server"), null)
    assert.equal(services.holder("local"), null)
})
