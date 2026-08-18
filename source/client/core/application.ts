import ClientLink from "@libs/the-link/plugins/client-link/client-link"
import { type ProxyOutcome, type ProxyRequest, type ProxyResponse, proxyMediaType } from "@server/core/protocol/proxy"
import { storageMediaType, type StorageRequest } from "@server/core/protocol/storage"
import { frame, frameBlob, unframe } from "@libs/framing"
import superjson from "@libs/superjson"
import LZString from "lz-string"

export default class Application {

    public readonly name: string

    public readonly displayName: string

    public readonly version: string

    public readonly doors: Doors

    public readonly clientLink: ClientLink

    public constructor(name: string, displayName: string, version: string, doors: Doors) {

        this.name = name

        this.displayName = displayName

        this.version = version

        this.doors = doors

        this.clientLink = new ClientLink(this.doors.link)

        this.clientLink.setSerialize(data => LZString.compressToBase64(superjson.stringify(data)))

        this.clientLink.setDeserialize(data => superjson.parse(LZString.decompressFromBase64(data)))
    }

    // A finite browser body keeps its length, so HTTP/1 can stream it from its
    // native backing store. A genuinely open stream is staged by `post` below:
    // browsers refuse unknown-length streaming requests over HTTP/1 before the
    // server ever sees them. Authorization belongs to the desktop and is added
    // here, never exposed to the pane.
    public async serve(content: ClientBody, description: ServedValue, authorization: string, signal?: AbortSignal): Promise<ServedFile> {

        const headers: Record<string, string> = {

            authorization,

            "content-disposition": `attachment; filename="value.${description.extension}"`,

            "content-type": description.type
        }

        const response = await this.post(this.doors.uploads, content, headers, signal)

        if (!response.ok) throw new Error(await response.text())

        return await response.json()
    }

    /** Carry an unrestricted request through the desktop's authorized proxy. */
    public async proxy(request: ProxyRequest, body: ClientBody | null, authorization: string, signal?: AbortSignal): Promise<ProxiedResponse> {

        const response = await this.post(

            this.doors.proxy,

            framedBody(request, body),

            {

                authorization,

                "content-type": proxyMediaType
            },

            signal
        )

        if (!response.ok) throw new Error(await response.text())

        const framed = await unframe<ProxyOutcome>(response.body)

        if ("error" in framed.metadata) {

            await framed.body.cancel().catch(() => undefined)

            const exception = new Error(framed.metadata.error.message)

            exception.name = framed.metadata.error.name

            throw exception
        }

        if (!framed.metadata.response.body) await framed.body.cancel().catch(() => undefined)

        return {

            ...framed.metadata.response,

            body: framed.metadata.response.body ? framed.body : null
        }
    }

    public async storageStream(request: Omit<StorageRequest, "operation">, authorization: string, signal?: AbortSignal) {

        const response = await this.storage({ ...request, operation: "stream" }, null, authorization, signal)

        if (!response.body) throw new Error("The storage response has no body")

        return response.body
    }

    public async storageWrite(request: Omit<StorageRequest, "operation">, body: ClientBody, authorization: string, signal?: AbortSignal) {

        await this.storage({ ...request, operation: "write" }, body, authorization, signal)
    }

    private async storage(request: StorageRequest, body: ClientBody | null, authorization: string, signal?: AbortSignal) {

        const response = await this.post(

            this.doors.storage,

            framedBody(request, body),

            {

                authorization,

                "content-type": storageMediaType
            },

            signal
        )

        if (!response.ok) throw new Error(await response.text())

        return response
    }

    private async post(url: string, source: ClientBody, headers: HeadersInit, signal?: AbortSignal) {

        const prepared = await finite(source, signal)

        try {

            return await fetch(url, { method: "POST", headers, body: prepared.body, signal })
        }

        finally { await prepared.remove() }
    }
}

function framedBody<Metadata>(metadata: Metadata, body: ClientBody | null) {

    return body instanceof ReadableStream ? frame(metadata, body) : frameBlob(metadata, body)
}

async function finite(source: ClientBody, signal?: AbortSignal): Promise<PreparedBody> {

    if (source instanceof Blob) return { body: source, remove: async () => undefined }

    const storage = navigator.storage as (StorageManager & { getDirectory?: () => Promise<FileSystemDirectoryHandle> }) | undefined

    // Origin-private storage keeps an unknown stream off the JavaScript heap
    // while giving fetch a finite File whose length HTTP/1 can carry.
    if (storage?.getDirectory) {

        const root = await storage.getDirectory()

        const name = `.request-${crypto.randomUUID()}`

        try {

            const handle = await root.getFileHandle(name, { create: true })

            await source.pipeTo(await handle.createWritable(), { signal })

            return {

                body: await handle.getFile(),

                remove: () => root.removeEntry(name).catch(() => undefined)
            }
        }

        catch (exception) {

            await root.removeEntry(name).catch(() => undefined)

            throw exception
        }
    }

    // Older engines may not expose origin-private files. A Blob still gives
    // the request a known length and preserves behavior, though the engine
    // chooses whether its backing store is memory or disk. Pipe explicitly so
    // aborting also cancels an open source instead of leaving staging pending.
    const chunks: BlobPart[] = []

    await source.pipeTo(new WritableStream({ write: chunk => { chunks.push(new Uint8Array(chunk)) } }), { signal })

    return { body: new Blob(chunks), remove: async () => undefined }
}

export type ProxiedResponse = Omit<ProxyResponse, "body"> & { body: ReadableStream<Uint8Array> | null }

export type ClientBody = Blob | ReadableStream<Uint8Array>

interface PreparedBody {

    body: Blob

    remove: () => Promise<void>
}

export interface ServedFile {

    file: string

    type: string | null

    size: number

    time: number
}

export interface ServedValue {

    extension: string

    type: string
}

/** Server-view doors required by the client core transport. */
export interface Doors {

    link: string

    proxy: string

    storage: string

    uploads: string

    program: string
}
