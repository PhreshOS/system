import { chmodSync, mkdirSync, rmSync } from "node:fs"
import { connect, createServer, type Socket } from "node:net"
import { dirname } from "node:path"

/** Open an owner-only local socket and safely recover a stale POSIX address. */
export default function localServer(path: string, receive: (socket: Socket) => void) {

    const namedPipe = process.platform === "win32"
    const server = createServer(receive)

    if (!namedPipe) mkdirSync(dirname(path), { recursive: true })

    return new Promise<string>(function (resolve, reject) {

        const listen = (recovered: boolean) => {

            server.once("error", function (error: NodeJS.ErrnoException) {

                if (error.code !== "EADDRINUSE" || recovered) return reject(error)

                alive(path).then(function (running) {

                    if (running) return reject(new Error(`A system is already running here — ${dirname(path)} holds one system, and two would share its programs and persistent state`))

                    if (namedPipe) return reject(error)

                    rmSync(path, { force: true })
                    listen(true)
                }, reject)
            })

            server.listen({ path, readableAll: false, writableAll: false }, () => resolve(secured(path, namedPipe)))
        }

        listen(false)
    })
}

function secured(path: string, namedPipe: boolean) {

    if (!namedPipe) chmodSync(path, 0o600)

    return path
}

function alive(path: string) {

    return new Promise<boolean>(function (resolve) {

        const socket = connect(path)

        socket.on("connect", () => { socket.destroy(); resolve(true) })
        socket.on("error", () => resolve(false))
    })
}
