import type Application from "@server/core/application"
import localServer from "./local-server"

/** Serve the complete Core-owned System control contract to the local owner. */
export default function control(application: Application, path: string) {

    return localServer(path, function (socket) {

        const controller = new AbortController()
        let buffer = ""
        let handled = false

        socket.on("data", function (chunk) {

            if (handled) return

            buffer += String(chunk)

            const boundary = buffer.indexOf("\n")

            if (boundary < 0) return

            handled = true

            answer(application, buffer.slice(0, boundary), controller.signal).then(
                result => respond(socket, { success: true, result }),
                error => respond(socket, { success: false, error: error instanceof Error ? error.message : String(error) })
            )
        })

        socket.on("close", () => controller.abort(new Error("The requester disconnected")))
        socket.on("error", () => undefined)
    })
}

async function answer(application: Application, line: string, signal: AbortSignal) {

    let request: unknown

    try { request = JSON.parse(line) }
    catch { throw new Error("What arrived is not JSON") }

    return application.systemControl.execute(request, signal)
}

function respond(socket: import("node:net").Socket, outcome: object) {

    if (!socket.writable) return

    socket.end(`${JSON.stringify(outcome)}\n`)
}
