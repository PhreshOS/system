import { type ProxyOutcome, type ProxyRequest, type ProxyResponse, proxyMediaType } from "@server/core/protocol/proxy"
import { frame, unframe } from "@libs/framing"
import Application from "@server/core/application"
import { Hono } from "hono"

/** The authorized HTTP door for server-side System fetch. */
export default function (application: Application) {

    const { authManager } = application.linkManager

    const proxy = new Hono()

    proxy.post("/", async function (context) {

        const authorization = context.req.header("authorization")

        try {

            authManager.verify(authorization)
        }

        catch (exception) {

            return context.text(exception instanceof Error ? exception.message : "Unauthorized", 401)
        }

        let request: Awaited<ReturnType<typeof unframe<ProxyRequest>>>

        try {

            request = await unframe<ProxyRequest>(context.req.raw.body)
        }

        catch (exception) {

            return context.text(exception instanceof Error ? exception.message : "The proxy request is invalid", 400)
        }

        let outcome: ProxyOutcome

        let responseBody: ReadableStream<Uint8Array> | null = null

        try {

            const metadata = request.metadata

            const response = await authManager.fetch(authorization, metadata.url, {

                body: metadata.body ? request.body : undefined,

                cache: metadata.cache,

                credentials: metadata.credentials,

                headers: metadata.headers,

                integrity: metadata.integrity,

                keepalive: metadata.keepalive,

                method: metadata.method,

                mode: metadata.mode,

                redirect: metadata.redirect,

                referrer: metadata.referrer,

                referrerPolicy: metadata.referrerPolicy,

                signal: context.req.raw.signal,

                ...metadata.body ? { duplex: "half" } : {}

            } as RequestInit & { duplex?: "half" })

            const responseMetadata: ProxyResponse = {

                body: response.body !== null,

                headers: responseHeaders(response.headers),

                redirected: response.redirected,

                status: response.status,

                statusText: response.statusText,

                type: response.type,

                url: response.url
            }

            outcome = { response: responseMetadata }

            responseBody = response.body
        }

        catch (exception) {

            outcome = {

                error: {

                    message: exception instanceof Error ? exception.message : "The request failed",

                    name: exception instanceof Error ? exception.name : "TypeError"
                }
            }
        }

        return new Response(frame(outcome, responseBody), {

            headers: {

                "cache-control": "no-store",

                "content-type": proxyMediaType
            }
        })
    })

    return proxy
}

function responseHeaders(headers: Headers): [string, string][] {

    const values = [...headers.entries()].filter(([name]) => name !== "set-cookie") as [string, string][]

    const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie

    if (getSetCookie) for (const value of getSetCookie.call(headers)) values.push(["set-cookie", value])

    return values
}
