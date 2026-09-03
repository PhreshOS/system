import type Application from "@server/core/application"
import localServer from "./local-server"
import apiRequest from "./api-request"
import programRequest from "./program-request"
import shellRequest from "./shell-request"
import systemRequest from "./system-request"

const maximumRequestSize = 16 * 1024 * 1024

/** Open the one owner-local gateway and route each connection internally. */
export default function gateway(application: Application, path: string) {

    return localServer(path, function (socket) {

        const controller = new AbortController()
        let buffer = ""
        let handled = false

        socket.on("data", function (chunk) {

            if (handled) return

            buffer += String(chunk)

            if (buffer.length > maximumRequestSize) {

                handled = true
                return fail(socket, new Error("The gateway request is too large"))
            }

            const boundary = buffer.indexOf("\n")

            if (boundary < 0) return

            handled = true

            let envelope: GatewayEnvelope

            try { envelope = parseEnvelope(buffer.slice(0, boundary)) }
            catch (error) { return fail(socket, error) }

            if (envelope.target === "program") {

                programRequest(application, socket, envelope.request).catch(error => fail(socket, error))
                return
            }

            if (envelope.target === "shell") {

                shellRequest(application, socket, envelope.request, controller.signal).catch(error => fail(socket, error))
                return
            }

            if (envelope.target === "api") {

                apiRequest(application, envelope.request, controller.signal).then(
                    result => finish(socket, { success: true, result }),
                    error => finish(socket, { success: false, error: reason(error) })
                )
                return
            }

            systemRequest(application, envelope.request, controller.signal).then(
                result => finish(socket, { success: true, result }),
                error => finish(socket, { success: false, error: reason(error) })
            )
        })

        socket.on("close", () => controller.abort(new Error("The requester disconnected")))
        socket.on("error", () => undefined)
    })
}

function parseEnvelope(line: string): GatewayEnvelope {

    let value: unknown

    try { value = JSON.parse(line) }
    catch { throw new Error("What arrived is not JSON") }

    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The gateway request must be an object")

    const envelope = value as Record<string, unknown>

    if (Object.keys(envelope).some(key => key !== "target" && key !== "request")) throw new Error("The gateway request contains an unknown field")

    if (envelope.target !== "api" && envelope.target !== "program" && envelope.target !== "shell" && envelope.target !== "system") throw new Error("The Gateway target must be api, program, shell, or system")
    if (!("request" in envelope)) throw new Error("The gateway request is missing")

    return { target: envelope.target, request: envelope.request }
}

function fail(socket: import("node:net").Socket, error: unknown) {

    if (socket.writable) socket.end(`${JSON.stringify({ event: "error", message: reason(error) })}\n`)
}

function finish(socket: import("node:net").Socket, outcome: object) {

    if (socket.writable) socket.end(`${JSON.stringify(outcome)}\n`)
}

function reason(error: unknown) {

    return error instanceof Error ? error.message : String(error)
}

interface GatewayEnvelope {

    target: "api" | "program" | "shell" | "system"
    request: unknown
}
