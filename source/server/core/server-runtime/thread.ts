import type { ServerRuntime, ServerRuntimeEnding, Stream } from "../server-runtime"
import { Worker } from "node:worker_threads"
import RuntimeChannel from "./channel"

type OutputListener = (stream: Stream, text: string) => void

const maximumPendingOutput = 256

/** Shared supervision for Server runtimes hosted in a System-owned thread. */
export default abstract class ThreadServerRuntime implements ServerRuntime {

    public readonly finished: Promise<ServerRuntimeEnding>

    private readonly worker: Worker

    private readonly channel: RuntimeChannel

    private readonly output = new Set<OutputListener>()

    private readonly pendingOutput: [Stream, string][] = []

    private stopping = false

    private clearingPendingOutput = false

    protected constructor(bootstrap: URL, workerData: object) {

        this.worker = new Worker(bootstrap, { stdout: true, stderr: true, workerData })

        this.channel = new RuntimeChannel(bytes => this.worker.postMessage(bytes))

        // Ending a thread on request gives it code 1, the same code an uncaught error gives. A
        // requested end is reported as an OS process ended by SIGTERM is, so it never reads as a crash.
        this.finished = new Promise(resolve => {
            this.worker.once("exit", code => {
                this.channel.close()
                resolve(this.stopping ? { code: null, signal: "SIGTERM" } : { code, signal: null })
            })
        })

        this.worker.on("message", message => this.channel.receive(message))
        this.worker.stdout?.on("data", chunk => this.print("out", String(chunk)))
        this.worker.stderr?.on("data", chunk => this.print("err", String(chunk)))
        this.worker.on("error", error => this.print("err", `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`))
    }

    public send(event: string, ...values: unknown[]) { this.worker.postMessage(this.channel.encode([event, ...values])) }

    public onMessage(listener: (event: string, ...values: unknown[]) => void) { this.channel.listen(listener) }

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

    public stop() {

        this.stopping = true
        this.worker.terminate().catch(() => undefined)
    }

    private print(stream: Stream, text: string) {

        if (this.output.size === 0) {

            if (this.pendingOutput.length < maximumPendingOutput) this.pendingOutput.push([stream, text])

            return
        }

        for (const listener of this.output) listener(stream, text)
    }
}
