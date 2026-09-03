import type Application from "@server/core/application"
import type { ShellOptions } from "@phreshos/core"
import type { Socket } from "node:net"

/** Stream one owner-local shell command through the System gateway. */
export default async function shellRequest(application: Application, socket: Socket, value: unknown, signal: AbortSignal) {

    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The shell request must be an object")

    const request = value as Record<string, unknown>

    if (Object.keys(request).some(key => key !== "command" && key !== "options")) throw new Error("The shell request contains an unknown field")
    if (typeof request.command !== "string") throw new Error("A shell command must be text")

    const options = request.options === undefined ? {} : request.options

    if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("Shell options must be an object")
    if (Object.keys(options).some(key => key !== "cwd" && key !== "env")) throw new Error("Shell options contain an unknown field")

    for await (const event of application.system.shell(request.command, { ...(options as ShellOptions), signal })) {

        if (!await write(socket, `${JSON.stringify(event)}\n`)) return
    }

    if (socket.writable) socket.end()
}

async function write(socket: Socket, value: string) {

    if (!socket.writable) return false
    if (socket.write(value)) return true

    await new Promise<void>(resolve => {

        const settled = () => {

            socket.off("drain", settled)
            socket.off("close", settled)
            resolve()
        }

        socket.once("drain", settled)
        socket.once("close", settled)
    })

    return socket.writable
}
