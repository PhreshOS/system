import { spawn } from "node:child_process"
import { homedir } from "node:os"
import type { ShellEvent, ShellOptions } from "@phreshos/core"
import ProcessTree from "@libs/process-tree"

type Queued = Readonly<{
    event: ShellEvent
    resume?: () => void
}>

/** Run one shell command while its iterator owns the complete process tree. */
export default function shell(command: string, options: ShellOptions = {}): AsyncGenerator<ShellEvent, void, void> {

    return (async function* () {

        const input = validate(command, options)
        const queue: Queued[] = []
        let wake: (() => void) | null = null
        let failure: Error | null = null
        let closed = false
        let treeEnded = false
        let ending: Readonly<{ code: number | null, signal: NodeJS.Signals | null }> | null = null
        let settle!: () => void
        const stopped = new Promise<void>(resolve => { settle = resolve })
        const notify = () => {

            wake?.()
            wake = null
        }
        const finish = () => {

            if (!closed || !treeEnded || !ending) return

            queue.push({
                event: {
                    event: "exited",
                    exit: {
                        status: ending.signal ? "signaled" : "exited",
                        code: ending.code,
                        signal: ending.signal
                    }
                }
            })
            settle()
            notify()
        }
        const child = spawn(input.command, {
            shell: true,
            detached: true,
            cwd: input.cwd,
            env: { ...process.env, ...input.env },
            stdio: ["ignore", "pipe", "pipe"]
        })
        const tree = new ProcessTree(child, (code, signal) => {

            ending = { code, signal }
            treeEnded = true
            finish()
        })
        const output = (stream: NodeJS.ReadableStream, name: "stdout" | "stderr") => {

            stream.on("data", chunk => {

                stream.pause()
                queue.push({ event: { event: "output", stream: name, text: String(chunk) }, resume: () => stream.resume() })
                notify()
            })
        }
        const abort = () => {

            failure = options.signal?.reason instanceof Error ? options.signal.reason : new Error("The shell command was cancelled")
            tree.stop()
            notify()
        }

        child.once("spawn", () => {

            if (typeof child.pid !== "number") {

                failure = new Error("The shell command started without a process identity")
                tree.stop()
            }
            else queue.push({ event: { event: "started", pid: child.pid } })

            notify()
        })
        child.once("error", error => {

            failure = error
            settle()
            notify()
        })
        child.once("close", () => {

            closed = true
            finish()
        })

        output(child.stdout!, "stdout")
        output(child.stderr!, "stderr")

        if (options.signal?.aborted) abort()
        else options.signal?.addEventListener("abort", abort, { once: true })

        try {

            while (true) {

                if (failure) throw failure

                const next = queue.shift()

                if (next) {

                    yield next.event
                    next.resume?.()

                    if (next.event.event === "exited") return

                    continue
                }

                await new Promise<void>(resolve => { wake = resolve })
            }
        }
        finally {

            options.signal?.removeEventListener("abort", abort)

            if (!closed || !treeEnded) tree.stop()

            await stopped
        }
    })()
}

function validate(command: string, options: ShellOptions) {

    if (typeof command !== "string" || !command.trim()) throw new Error("A shell command must be non-empty text")
    if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("Shell options must be an object")
    if (Object.keys(options).some(key => key !== "cwd" && key !== "env" && key !== "signal")) throw new Error("Shell options contain an unknown field")
    if (options.signal !== undefined && !(options.signal instanceof AbortSignal)) throw new Error("A shell signal must be an AbortSignal")

    const cwd = options.cwd ?? homedir()
    const env = options.env ?? {}

    if (typeof cwd !== "string" || !cwd) throw new Error("A shell working directory must be non-empty text")
    if (!env || typeof env !== "object" || Array.isArray(env) || Object.values(env).some(value => typeof value !== "string")) {

        throw new Error("Shell environment values must be text")
    }

    return { command, cwd, env }
}
