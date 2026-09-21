import ProcessTree, { detachedProcessTree } from "@libs/process-tree"
import type { ServerRuntime, ServerRuntimeEnding, Stream } from "../server-runtime"
import { FrameReader, writeFrame } from "@the-link/ipc/framing"
import messagepack from "@the-link/messagepack"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { chmod, rm } from "node:fs/promises"
import { createServer, type Server, type Socket } from "node:net"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import RuntimeInbox from "./inbox"

type OutputListener = (stream: Stream, text: string) => void

const maximumFrameSize = 16 * 1024 * 1024

/** Runs one Server Endpoint as an operating-system process tree. */
export default class CommandServerRuntime implements ServerRuntime {

    public readonly finished: Promise<ServerRuntimeEnding>

    private readonly inbox = new RuntimeInbox()
    private readonly output = new Set<OutputListener>()
    private readonly pendingMessages: Uint8Array[] = []
    private readonly address = commandAddress()
    private readonly token = randomUUID()
    private readonly server: Server
    private readonly sockets = new Set<Socket>()

    private tree: ProcessTree | null = null
    private socket: Socket | null = null
    private writes = Promise.resolve()
    private stopping = false

    public constructor(command: string, directory: string) {

        let finish!: (ending: ServerRuntimeEnding) => void
        this.finished = new Promise(resolve => { finish = resolve })

        this.server = createServer(socket => this.accept(socket))
        this.server.on("error", error => {
            this.print("err", `${error.stack ?? error.message}\n`)
            if (this.tree) this.tree.stop()
            else {
                this.closeTransport().catch(() => undefined)
                finish({ code: 1, signal: null })
            }
        })
        this.server.once("listening", () => {
            // The token authenticates the Endpoint; POSIX permissions also keep
            // unrelated local users from opening the private transport.
            const protect = process.platform === "win32" ? Promise.resolve() : chmod(this.address, 0o600)
            protect.then(() => this.start(command, directory, finish)).catch(error => {
                this.print("err", `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
                this.closeTransport().catch(() => undefined)
                finish({ code: 1, signal: null })
            })
        })
        this.server.listen({ path: this.address, readableAll: false, writableAll: false })
    }

    public send(event: string, ...values: unknown[]) {

        const message = messagepack.serialize([event, ...values])

        if (!this.socket) this.pendingMessages.push(message)
        else this.write(message)
    }

    public onMessage(listener: (event: string, ...values: unknown[]) => void) { this.inbox.listen(listener) }

    public onOutput(listener: OutputListener) { this.output.add(listener) }

    public stop() {

        this.stopping = true
        this.tree?.stop()

        if (!this.tree) this.closeTransport().catch(() => undefined)
    }

    private start(command: string, directory: string, finish: (ending: ServerRuntimeEnding) => void) {

        if (this.stopping) return

        const child = spawn(command, {
            shell: true,
            detached: detachedProcessTree,
            cwd: directory,
            stdio: ["ignore", "pipe", "pipe"],
            env: commandServerEnvironment(directory, process.env, this.address, this.token)
        })

        this.tree = new ProcessTree(child, async (code, signal) => {
            await this.closeTransport()
            finish({ code, signal })
        })

        child.stdout?.on("data", chunk => this.print("out", String(chunk)))
        child.stderr?.on("data", chunk => this.print("err", String(chunk)))
        child.on("error", error => this.print("err", `${error.stack ?? error.message}\n`))

        if (this.stopping) this.tree.stop()
    }

    private accept(candidate: Socket) {

        this.sockets.add(candidate)
        const reader = new FrameReader(maximumFrameSize)
        let authenticated = false

        candidate.on("data", chunk => {
            try {
                for (const frame of reader.read(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk)) {
                    if (!authenticated) {
                        authenticated = new TextDecoder().decode(frame) === this.token
                        if (!authenticated || this.socket) return candidate.destroy()

                        this.socket = candidate
                        for (const message of this.pendingMessages.splice(0)) this.write(message)
                        continue
                    }

                    this.inbox.receive(frame)
                }
            } catch { candidate.destroy() }
        })
        candidate.on("error", () => undefined)
        candidate.once("close", () => {
            this.sockets.delete(candidate)
            if (this.socket === candidate) this.socket = null
        })
    }

    private write(message: Uint8Array) {

        const socket = this.socket
        if (!socket) return

        this.writes = this.writes.then(() => writeFrame(socket, message, maximumFrameSize))
        this.writes.catch(() => undefined)
    }

    private print(stream: Stream, text: string) {
        for (const listener of this.output) listener(stream, text)
    }

    private async closeTransport() {

        for (const socket of this.sockets) socket.destroy()
        this.sockets.clear()
        this.socket = null

        if (this.server.listening) {
            await new Promise<void>(resolve => this.server.close(() => resolve()))
        }

        if (process.platform !== "win32") await rm(this.address, { force: true }).catch(() => undefined)
    }
}

export function commandServerEnvironment(
    directory: string,
    environment: NodeJS.ProcessEnv = process.env,
    address?: string,
    token?: string
): NodeJS.ProcessEnv {

    const key = Object.keys(environment).find(name => name.toLowerCase() === "path") ?? "PATH"
    const inherited = environment[key]

    return {
        ...environment,
        [key]: [join(directory, "node_modules", ".bin"), inherited].filter(Boolean).join(delimiter),
        ...(address ? { PHRESHOS_SERVER_ADDRESS: address } : {}),
        ...(token ? { PHRESHOS_SERVER_TOKEN: token } : {})
    }
}

function commandAddress() {

    // Unix socket addresses have a small platform limit; keep the basename
    // short enough even when the host's temporary directory is already long.
    const identity = `ps-${randomUUID().replaceAll("-", "")}`

    return process.platform === "win32" ? `\\\\.\\pipe\\${identity}` : join(tmpdir(), `${identity}.sock`)
}
