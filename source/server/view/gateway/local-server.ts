import { mkdirSync, rmSync } from "node:fs"
import { connect } from "node:net"
import { dirname } from "node:path"
import { SocketServer } from "@the-link/ipc/socket-server"

/** Open the owner-only IPC listener and safely recover a stale POSIX address. */
export default async function localServer(path: string, prepare: (server: SocketServer) => void) {

    const namedPipe = process.platform === "win32"

    if (!namedPipe) mkdirSync(dirname(path), { recursive: true })

    for (let recovered = false; ; recovered = true) {

        const server = new SocketServer(path, { mode: 0o600 })

        prepare(server)

        try {

            await server.listen()

            return { path, server, close: () => server.close() }
        }

        catch (error) {

            const failure = error as NodeJS.ErrnoException

            if (failure.code !== "EADDRINUSE" || recovered) throw error

            if (await alive(path)) {

                throw new Error(`A system is already running here — ${dirname(path)} holds one system, and two would share its programs and persistent state`)
            }

            if (namedPipe) throw error

            rmSync(path, { force: true })
        }
    }
}

function alive(path: string) {

    return new Promise<boolean>(function (resolve) {

        const socket = connect(path)

        socket.on("connect", () => { socket.destroy(); resolve(true) })
        socket.on("error", () => resolve(false))
    })
}
