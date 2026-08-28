import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { delimiter, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { decode, encode } from "@msgpack/msgpack"
import { commandServerEnvironment, WorkerServerRuntime } from "@server/core/link-manager/auth-manager/process-manager/server-runtime"
import Program from "@server/core/link-manager/auth-manager/program-manager/program"
import type { ProgramConfig } from "@server/core/link-manager/auth-manager/program-manager/config"

const directory = await mkdtemp(join(tmpdir(), "phresh-worker-runtime-"))
const entry = join(directory, "server.mjs")
const codec = pathToFileURL(resolve("node_modules/@msgpack/msgpack/dist.esm/index.mjs")).href

assert.equal(
    commandServerEnvironment(directory, { Path: "/native/bin" }).Path,
    `${join(directory, "node_modules", ".bin")}${delimiter}/native/bin`
)

await writeFile(entry, `
import { parentPort } from "node:worker_threads"
import { decode, encode } from ${JSON.stringify(codec)}

console.log("worker output")
parentPort.postMessage(encode(["boundary", "ready"]))
parentPort.on("message", message => {
    const [event, value] = decode(message)
    if (event === "probe") parentPort.postMessage(encode(["probe-result", value]))
})
`)

try {
    const program = new Program({ identity: "worker-verification", server: { location: directory, entryFile: "server.mjs" } })

    await program.validate()

    assert.equal(program.serverEntryPath, entry)

    assert.throws(() => new Program({ identity: "worker-conflict", server: { location: directory, startCommand: "node main.js", entryFile: "server.mjs" } } as unknown as ProgramConfig))
    assert.throws(() => new Program({ identity: "worker-escape", server: { location: directory, entryFile: "../server.mjs" } }))

    const runtime = new WorkerServerRuntime(entry)
    const messages: unknown[][] = []
    const output: ["out" | "err", string][] = []

    runtime.onMessage(message => {
        if (!(message instanceof Uint8Array)) throw new Error("The Worker response must be bytes")
        const decoded = decode(message)
        if (!Array.isArray(decoded)) throw new Error("The Worker response must be an array")
        messages.push(decoded)
    })
    runtime.onOutput((stream, text) => output.push([stream, text]))

    await until(() => messages.some(message => message[0] === "boundary" && message[1] === "ready"))

    runtime.send(encode(["probe", 42]))

    await until(() => messages.some(message => message[0] === "probe-result"))
    await until(() => output.some(([stream, text]) => stream === "out" && text.includes("worker output")))

    assert.deepEqual(messages.find(message => message[0] === "probe-result"), ["probe-result", 42])

    runtime.stop()

    const ending = await runtime.finished

    assert.equal(ending.signal, null)
} finally {
    await rm(directory, { recursive: true, force: true })
}

async function until(condition: () => boolean, timeout = 2_000) {
    const began = Date.now()

    while (!condition()) {
        if (Date.now() - began >= timeout) throw new Error(`Worker verification timed out after ${timeout}ms`)
        await new Promise(resolve => setTimeout(resolve, 10))
    }
}
