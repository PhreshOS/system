export const proxyMediaType = "application/x-proxy-stream"

/** A normalized request whose body follows its metadata in the proxy stream. */
export interface ProxyRequest {

    body: boolean

    cache: RequestCache

    credentials: RequestCredentials

    headers: [string, string][]

    integrity: string

    keepalive: boolean

    method: string

    mode: RequestMode

    redirect: RequestRedirect

    referrer: string

    referrerPolicy: ReferrerPolicy

    url: string
}

/** The parts of a server-side Response that can be reconstructed in a pane. */
export interface ProxyResponse {

    body: boolean

    headers: [string, string][]

    redirected: boolean

    status: number

    statusText: string

    type: ResponseType

    url: string
}

export type ProxyOutcome = { response: ProxyResponse } | { error: { message: string, name: string } }
