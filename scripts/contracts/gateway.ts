import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { connect } from "node:net"
import { resolve } from "node:path"
import gatewayAddress from "@server/view/gateway/address"
import gateway from "@server/view/gateway/gateway"
import type Application from "@server/core/application"

const directory = await mkdtemp(resolve(".verify-gateway-"))
const path = gatewayAddress(directory)
const entry = {
    installed: false,
    program: { identity: "example" }
}
const forkedEntry = {
    installed: false,
    program: { identity: "forked" }
}
const programSnapshot = {
    reference: "example-reference",
    identity: "example",
    assetId: "00000000-0000-4000-8000-000000000000",
    name: "Example",
    version: "1.0.0",
    description: null,
    installed: false,
    hasAgent: false,
    server: null,
    client: { start: true }
}
const process = {
    reference: "process-reference",
    identity: "process-identity",
    program: { identity: entry.program.identity, client: {} },
    waitReady(endpoint: "server" | "client", notify: () => void) {

        assert.equal(endpoint, "client")
        notify()

        return () => undefined
    },
    onExit() { return () => undefined }
}
const application = {
    system: {
        listPrograms() { return [] },
        async *shell(command: string) {

            assert.equal(command, "printf hello")

            yield { event: "started", pid: 42 }
            yield { event: "output", stream: "stdout", text: "hello" }
            yield { event: "exited", exit: { status: "exited", code: 0, signal: null } }
        },
        async forceCreateProgram() { return entry.program },
        requireProgram(identity: string) { return identity === forkedEntry.program.identity ? forkedEntry : entry },
        programSnapshot(selected: typeof entry) { return { ...programSnapshot, identity: selected.program.identity } },
        holdProgram(handle: { identity?: string, reference?: string }) {

            assert.deepEqual(handle, { identity: "example", reference: "example-reference" })
            return entry.program
        },
        forkProgram(owner: unknown, identity: string) {

            assert.equal(owner, entry.program)
            assert.equal(identity, forkedEntry.program.identity)

            return forkedEntry.program
        },
        async *installProgram() {},
        findProcess() { return null },
        resolveProcess() { return process },
        endpointSnapshot(_process: unknown, endpoint: string) {

            return { process: process.identity, endpoint, running: true }
        }
    },
    linkManager: {
        authManager: {
            processManager: {
                processes: new Map(),
                async exit() {}
            },
            programManager: {}
        }
    }
}

const server = await gateway(application as unknown as Application, path)

try {
    const system = await exchange(path, { target: "system", request: { capability: "program", operation: "list", input: {} } })

    assert.deepEqual(system, [{ success: true, result: { data: [], total: 0, truncated: false } }])

    const shell = await exchange(path, {
        target: "shell",
        request: { command: "printf hello", options: {} }
    })

    assert.deepEqual(shell, [
        { event: "started", pid: 42 },
        { event: "output", stream: "stdout", text: "hello" },
        { event: "exited", exit: { status: "exited", code: 0, signal: null } }
    ])

    const ready = await exchange(path, {
        target: "system",
        request: {
            capability: "endpoint",
            operation: "waitReady",
            input: { process: process.identity, endpoint: "client" }
        }
    })

    assert.deepEqual(ready, [{
        success: true,
        result: { process: process.identity, endpoint: "client", running: true }
    }])

    const created = await exchange(path, {
        target: "program",
        request: { word: "force-create", program: { identity: "example", storage: "/tmp/example", client: { location: "/tmp/client" } } }
    })

    assert.deepEqual(created, [{
        event: "created",
        program: {
            reference: "example-reference",
            identity: "example",
            assetId: "00000000-0000-4000-8000-000000000000",
            name: "Example",
            version: "1.0.0",
            description: null,
            installed: false,
            hasAgent: false,
            server: null,
            client: { start: true }
        }
    }])

    const forked = await exchange(path, {
        target: "program",
        request: {
            word: "fork",
            handle: { identity: "example", reference: "example-reference" },
            identity: "forked"
        }
    })

    assert.deepEqual(forked, [{
        event: "created",
        program: { ...programSnapshot, identity: "forked" }
    }])

    const installed = await exchange(path, {
        target: "program",
        request: { word: "install-existing", handle: { identity: "example", reference: "example-reference" } }
    })

    assert.deepEqual(installed, [{
        event: "installed",
        identity: "example"
    }])
} finally {
    await server.close()
    await rm(directory, { recursive: true, force: true })
}

async function exchange(path: string, request: unknown): Promise<unknown[]> {

    return await new Promise<unknown[]>((resolve, reject) => {

        const socket = connect(path)
        let buffer = ""

        socket.on("connect", () => socket.write(`${JSON.stringify(request)}\n`))
        socket.on("data", chunk => { buffer += String(chunk) })
        socket.on("error", reject)
        socket.on("close", () => resolve(buffer.trim().split("\n").filter(Boolean).map(line => JSON.parse(line))))
    })
}

console.log("shared gateway verified")
