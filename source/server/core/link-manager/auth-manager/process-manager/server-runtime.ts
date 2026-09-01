import ProcessTree from "@libs/process-tree"
import { spawn, type ChildProcess } from "node:child_process"
import { Worker } from "node:worker_threads"
import { delimiter, join } from "node:path"

export interface ServerRuntime {

    readonly finished: Promise<Ending>

    send(message: Uint8Array): void

    onMessage(listener: (message: unknown) => void): void

    onOutput(listener: OutputListener): void

    stop(): void
}

/** One Server running as an isolated operating-system process tree. */
export class CommandServerRuntime implements ServerRuntime {

    public readonly finished: Promise<Ending>

    private readonly child: ChildProcess

    private readonly tree: ProcessTree

    private readonly inbox = new RuntimeInbox()

    public constructor(command: string, directory: string) {

        this.child = spawn(command, {

            shell: true,

            detached: true,

            cwd: directory,

            stdio: ["ignore", "pipe", "pipe", "ipc"],

            serialization: "advanced",

            env: commandServerEnvironment(directory)
        })

        if (typeof this.child.send !== "function") throw new Error("The server process has no IPC channel")

        let finish!: (ending: Ending) => void

        this.finished = new Promise(resolve => { finish = resolve })

        this.tree = new ProcessTree(this.child, (code, signal) => finish({ code, signal }))

        this.child.on("message", message => {

            const bytes = commandMessageBytes(message)

            if (bytes) this.inbox.receive(bytes)
        })

        this.child.on("error", () => undefined)
    }

    public send(message: Uint8Array) { this.child.send!(message) }

    public onMessage(listener: (message: unknown) => void) { this.inbox.listen(listener) }

    public onOutput(listener: OutputListener) {

        this.child.stdout?.on("data", chunk => listener("out", String(chunk)))

        this.child.stderr?.on("data", chunk => listener("err", String(chunk)))
    }

    public stop() { this.tree.stop() }
}

/** Give a Server command the package-local tools belonging to its execution directory. */
export function commandServerEnvironment(directory: string, environment: NodeJS.ProcessEnv = process.env) {

    const key = Object.keys(environment).find(name => name.toLowerCase() === "path") ?? "PATH"

    const inherited = environment[key]

    return {

        ...environment,

        [key]: [join(directory, "node_modules", ".bin"), inherited].filter(Boolean).join(delimiter)
    }
}

/** One JavaScript Server running as an isolate inside the System process. */
export class WorkerServerRuntime implements ServerRuntime {

    public readonly finished: Promise<Ending>

    private readonly worker: Worker

    private readonly output = new Set<OutputListener>()

    private readonly pendingOutput: [Stream, string][] = []

    private clearingPendingOutput = false

    private readonly inbox = new RuntimeInbox()

    public constructor(entry: string) {

        this.worker = new Worker(entry, { stdout: true, stderr: true })

        this.finished = new Promise(resolve => {

            this.worker.once("exit", code => resolve({ code, signal: null }))
        })

        this.worker.on("message", message => this.inbox.receive(message))

        this.worker.stdout?.on("data", chunk => this.print("out", String(chunk)))

        this.worker.stderr?.on("data", chunk => this.print("err", String(chunk)))

        this.worker.on("error", error => this.print("err", `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`))
    }

    public send(message: Uint8Array) { this.worker.postMessage(message) }

    public onMessage(listener: (message: unknown) => void) { this.inbox.listen(listener) }

    public onOutput(listener: OutputListener) {

        this.output.add(listener)

        for (const [stream, text] of this.pendingOutput) listener(stream, text)

        if (this.pendingOutput.length && !this.clearingPendingOutput) {

            this.clearingPendingOutput = true

            queueMicrotask(() => {

                this.pendingOutput.splice(0)

                this.clearingPendingOutput = false
            })
        }
    }

    public stop() { this.worker.terminate().catch(() => undefined) }

    private print(stream: Stream, text: string) {

        if (this.output.size === 0) {

            if (this.pendingOutput.length < maximumPendingOutput) this.pendingOutput.push([stream, text])

            return
        }

        for (const listener of this.output) listener(stream, text)
    }
}

class RuntimeInbox {

    private listener: ((message: unknown) => void) | null = null

    private readonly pending: unknown[] = []

    public receive(message: unknown) {

        if (this.listener) this.listener(message)

        else if (this.pending.length < maximumPendingMessages) this.pending.push(message)
    }

    public listen(listener: (message: unknown) => void) {

        if (this.listener) throw new Error("The server runtime already has a message listener")

        this.listener = listener

        for (const message of this.pending.splice(0)) listener(message)
    }
}

export type Stream = "out" | "err"

type OutputListener = (stream: Stream, text: string) => void

type Ending = { code: number | null, signal: NodeJS.Signals | null }

const maximumPendingMessages = 256

const maximumPendingOutput = 256

function commandMessageBytes(value: unknown) {

    if (value instanceof Uint8Array) return Uint8Array.from(value)

    if (value instanceof ArrayBuffer) return new Uint8Array(value)

    if (ArrayBuffer.isView(value)) return Uint8Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))

    if (value === null || typeof value !== "object") return null

    const record = value as Record<string, unknown>

    const bytes = new Uint8Array(Object.keys(record).length)

    for (let index = 0; index < bytes.length; index++) {

        const byte = record[String(index)]

        if (typeof byte !== "number" || !Number.isInteger(byte) || byte < 0 || byte > 255) return null

        bytes[index] = byte
    }

    return bytes
}
