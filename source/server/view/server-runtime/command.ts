import ProcessTree from "@libs/process-tree"
import type { ServerRuntime, ServerRuntimeEnding, Stream } from "@server/core/server-runtime"
import messagepack from "@the-link/messagepack"
import { spawn, type ChildProcess } from "node:child_process"
import { delimiter, join } from "node:path"
import RuntimeInbox, { runtimeMessageBytes } from "./inbox"

type OutputListener = (stream: Stream, text: string) => void

/** Represents one Server Endpoint as an isolated operating-system process tree. */
export default class CommandServerRuntime implements ServerRuntime {

    public readonly finished: Promise<ServerRuntimeEnding>

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

        let finish!: (ending: ServerRuntimeEnding) => void

        this.finished = new Promise(resolve => { finish = resolve })

        this.tree = new ProcessTree(this.child, (code, signal) => finish({ code, signal }))

        this.child.on("message", message => {

            const bytes = runtimeMessageBytes(message)

            if (bytes) this.inbox.receive(bytes)
        })

        this.child.on("error", () => undefined)
    }

    public send(event: string, ...values: unknown[]) {

        this.child.send!(messagepack.serialize([event, ...values]))
    }

    public onMessage(listener: (event: string, ...values: unknown[]) => void) {

        this.inbox.listen(listener)
    }

    public onOutput(listener: OutputListener) {

        this.child.stdout?.on("data", chunk => listener("out", String(chunk)))

        this.child.stderr?.on("data", chunk => listener("err", String(chunk)))
    }

    public stop() { this.tree.stop() }
}

/** Gives a command the package-local executables belonging to its directory. */
export function commandServerEnvironment(directory: string, environment: NodeJS.ProcessEnv = process.env) {

    const key = Object.keys(environment).find(name => name.toLowerCase() === "path") ?? "PATH"

    const inherited = environment[key]

    return {

        ...environment,

        [key]: [join(directory, "node_modules", ".bin"), inherited].filter(Boolean).join(delimiter)
    }
}
