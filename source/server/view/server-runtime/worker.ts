import type { ServerRuntime, ServerRuntimeEnding, Stream } from "@server/core/server-runtime"
import messagepack from "@the-link/messagepack"
import { Worker } from "node:worker_threads"
import RuntimeInbox from "./inbox"

type OutputListener = (stream: Stream, text: string) => void

const maximumPendingOutput = 256

/** Represents one JavaScript Server Endpoint as an isolate inside the System process. */
export default class WorkerServerRuntime implements ServerRuntime {

    public readonly finished: Promise<ServerRuntimeEnding>

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

    public send(event: string, ...values: unknown[]) {

        this.worker.postMessage(messagepack.serialize([event, ...values]))
    }

    public onMessage(listener: (event: string, ...values: unknown[]) => void) {

        this.inbox.listen(listener)
    }

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
