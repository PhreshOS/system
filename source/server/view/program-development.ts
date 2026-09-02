import { upgradeWebSocket } from "@hono/node-server"
import type Program from "@server/core/link-manager/auth-manager/program-manager/program"
import { proxy } from "hono/proxy"
import type { Context } from "hono"
import { WebSocket, type RawData } from "ws"

/** Maps one public Program asset request onto its development server. */
export function developmentTarget(program: Program, request: string) {

    if (!program.clientUrl) return null

    const source = new URL(program.clientUrl)
    const asked = new URL(request)

    source.pathname = asked.pathname
    source.search = asked.search
    source.hash = ""

    return source
}

/** Forwards one HTTP asset request without exposing its source to the Desktop. */
export async function developmentResponse(context: Context, target: URL) {

    const headers = new Headers(context.req.raw.headers)

    headers.delete("host")
    headers.set("x-forwarded-host", new URL(context.req.url).host)
    headers.set("x-forwarded-proto", new URL(context.req.url).protocol.slice(0, -1))

    try {

        const response = await proxy(target, {

            raw: context.req.raw,

            headers,

            redirect: "manual"
        })

        rewriteLocation(response, target, context.req.url)

        return response
    }

    catch {

        return context.text("The development Client is unavailable", 502)
    }
}

/** Bridges one WebSocket through the same Program asset address as HTTP. */
export function developmentSocket(context: Context, target: URL) {

    return upgradeWebSocket(context, bridge(target, context.req.header("sec-websocket-protocol")), {

        onError(error) { console.error(error) }
    })
}

function rewriteLocation(response: Response, target: URL, request: string) {

    const location = response.headers.get("location")

    if (!location) return

    const upstream = new URL(location, target)

    if (upstream.origin !== target.origin) return

    const publicOrigin = new URL(request).origin

    response.headers.set("location", new URL(`${upstream.pathname}${upstream.search}${upstream.hash}`, publicOrigin).href)
}

function bridge(target: URL, protocolHeader: string | undefined) {

    const protocols = protocolHeader?.split(",").map(value => value.trim()).filter(Boolean) ?? []
    const queued: DevelopmentMessage[] = []
    let server: WebSocket | null = null

    return {

        onOpen(_event: Event, client: import("hono/ws").WSContext) {

            const address = new URL(target)

            address.protocol = address.protocol === "https:" ? "wss:" : "ws:"

            const upstream = new WebSocket(address, protocols, { origin: target.origin })

            server = upstream

            upstream.on("open", () => {

                for (const message of queued.splice(0)) upstream.send(message)
            })

            upstream.on("message", (message, binary) => sendClient(client, message, binary))

            upstream.on("close", (code, reason) => closeClient(client, code, reason.toString()))

            upstream.on("error", () => client.close(1011, "The development Client WebSocket failed"))
        },

        onMessage(event: MessageEvent, client: import("hono/ws").WSContext) {

            forwardServer(server, queued, event.data).catch(() => client.close(1011, "The development Client WebSocket failed"))
        },

        onClose(event: CloseEvent) {

            closeServer(server, event.code, event.reason)
        },

        onError() {

            server?.close(1011, "The Desktop WebSocket failed")
        }
    }
}

type DevelopmentMessage = string | ArrayBuffer | Uint8Array<ArrayBuffer>

async function forwardServer(server: WebSocket | null, queued: DevelopmentMessage[], source: unknown) {

    const message = source instanceof Blob ? await source.arrayBuffer() : source

    if (typeof message !== "string" && !(message instanceof ArrayBuffer) && !ArrayBuffer.isView(message)) return

    let value: DevelopmentMessage

    if (typeof message === "string" || message instanceof ArrayBuffer) value = message

    else {

        const bytes = new Uint8Array(message.byteLength)

        bytes.set(new Uint8Array(message.buffer, message.byteOffset, message.byteLength))

        value = bytes
    }

    if (server?.readyState === WebSocket.OPEN) server.send(value)

    else queued.push(value)
}

function sendClient(client: import("hono/ws").WSContext, source: RawData, binary: boolean) {

    if (!binary) {

        client.send(String(source))

        return
    }

    const value = Array.isArray(source) ? Buffer.concat(source) : source

    if (value instanceof ArrayBuffer) client.send(value)

    else client.send(Uint8Array.from(value))
}

function closeClient(client: import("hono/ws").WSContext, code: number, reason: string) {

    if (validCloseCode(code)) client.close(code, reason)

    else client.close()
}

function closeServer(server: WebSocket | null, code: number, reason: string) {

    if (!server) return

    if (validCloseCode(code)) server.close(code, reason)

    else server.close()
}

function validCloseCode(code: number) {

    return code === 1000 || (code >= 1001 && code <= 1014 && ![1004, 1005, 1006].includes(code)) || (code >= 3000 && code <= 4999)
}
