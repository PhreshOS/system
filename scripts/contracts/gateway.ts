import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { connect } from "node:net"
import { join, resolve } from "node:path"
import gateway from "@server/view/gateway/gateway"
import type Application from "@server/core/application"

const directory = await mkdtemp(resolve(".verify-gateway-"))
const path = join(directory, "gateway.sock")
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
                async *installSource(program: { identity: string, name: string, version: string }) {
                    yield {
                        stage: "installed",
                        replaced: false,
                        entry: {
                            identity: program.identity,
                            program: { name: program.name, config: { version: program.version } }
                        }
                    }
                }
            }
        }
    }
}

const server = await gateway(application as unknown as Application, path)

try {
    const system = await exchange(path, { target: "system", request: { capability: "program", operation: "list", input: {} } })

    assert.deepEqual(system, [{ success: true, result: { received: { capability: "program", operation: "list", input: {} } } }])

    const program = await exchange(path, {
        target: "program",
        request: { word: "install", program: { identity: "example", name: "Example", version: "1.0.0" } }
    })

    assert.deepEqual(program, [{
        event: "installed",
        replaced: false,
        program: { identity: "example", name: "Example", version: "1.0.0" }
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
