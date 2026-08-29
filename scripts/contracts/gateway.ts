import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { connect } from "node:net"
import { resolve } from "node:path"
import gatewayAddress from "@server/view/gateway/address"
import gateway from "@server/view/gateway/gateway"
import type Application from "@server/core/application"

const directory = await mkdtemp(resolve(".verify-gateway-"))
const path = gatewayAddress(directory)
const application = {
    systemControl: {
        async execute(request: unknown) { return { received: request } }
    },
    linkManager: {
        authManager: {
            processManager: {
                processes: new Map(),
                async exit() {}
            },
            programManager: {
                async forceCreate() { return { identity: "example" } },
                find() {
                    return {
                        record() {
                            return {
                                reference: "example-reference",
                                identity: "example",
                                name: "Example",
                                version: "1.0.0",
                                description: null,
                                hasAgent: false,
                                server: null,
                                client: { start: true }
                            }
                        }
                    }
                },
                held(handle: { identity?: string, reference?: string }) {
                    assert.deepEqual(handle, { identity: "example", reference: "example-reference" })
                    return { identity: "example" }
                },
                async *installStreaming() {}
            }
        }
    }
}

const server = await gateway(application as unknown as Application, path)

try {
    const system = await exchange(path, { target: "system", request: { capability: "program", operation: "list", input: {} } })

    assert.deepEqual(system, [{ success: true, result: { received: { capability: "program", operation: "list", input: {} } } }])

    const created = await exchange(path, {
        target: "program",
        request: { word: "force-create", program: { identity: "example", storage: "/tmp/example", client: { location: "/tmp/client" } } }
    })

    assert.deepEqual(created, [{
        event: "created",
        program: {
            reference: "example-reference",
            identity: "example",
            name: "Example",
            version: "1.0.0",
            description: null,
            hasAgent: false,
            server: null,
            client: { start: true }
        }
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
