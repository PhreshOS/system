import { createWriteStream, lstatSync, mkdirSync } from "node:fs"
import FileManager from "@libs/file-manager"
import { rename, rm } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { type ReadableStream as NodeReadableStream } from "node:stream/web"
import { isUploadFile, type Upload } from "@phreshos/core"

export const uploadLimit = 1024 * 1024 * 1024

export class MissingUploadValueError extends Error {

    public constructor() {

        super("A value is required")
    }
}

export class UploadTooLargeError extends Error {

    public constructor() {

        super(`The upload exceeds ${uploadLimit / 1024 / 1024 / 1024} GB`)
    }
}

/**
 * Completed public files. Their generated filename is their whole record:
 * there is no table to synchronize and no visibility state to remember.
 *
 * Incoming bytes are written beside their destination under a hidden name.
 * Only a complete value at or below the limit is renamed into public reach;
 * interruption and refusal remove the temporary file.
 */
export default class UploadManager {

    public readonly fileManager: FileManager

    public constructor(fileManager: FileManager) {

        this.fileManager = fileManager

        mkdirSync(fileManager.path, { recursive: true })
    }

    public path(file: string) {

        if (!isUploadFile(file)) throw new Error("That is not an upload file")

        return this.fileManager.join(file)
    }

    public async write(extension: string, content: ReadableStream<Uint8Array> | null, signal?: AbortSignal) {

        if (!/^[a-z0-9]+$/.test(extension)) throw new Error("An upload needs a valid extension")

        if (!content) throw new MissingUploadValueError()

        const uuid = randomUUID()

        const file = `${uuid}.${extension}`

        const temporary = this.fileManager.join(`.${uuid}.uploading`)

        let size = 0

        try {

            await pipeline(

                Readable.fromWeb(content as unknown as NodeReadableStream<Uint8Array>),

                async function* (source: AsyncIterable<Uint8Array>) {

                    for await (const chunk of source) {

                        size += chunk.byteLength

                        if (size > uploadLimit) throw new UploadTooLargeError()

                        yield chunk
                    }
                },

                createWriteStream(temporary, { flags: "wx" }),

                { signal }
            )

            await rename(temporary, this.path(file))
        }

        catch (exception) {

            await rm(temporary, { force: true }).catch(() => undefined)

            throw exception
        }

        return file
    }

    public stat(file: string): Upload | null {

        let stat

        try { stat = lstatSync(this.path(file)) }
        catch (error) {

            if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
            throw error
        }

        if (!stat.isFile()) throw new Error("That upload key does not identify a file")

        return { file, type: mediaType(file), size: stat.size, time: Math.round(stat.mtimeMs) }
    }

}

function mediaType(file: string) {

    return types[file.slice(file.lastIndexOf(".") + 1)] ?? null
}

const types: Readonly<Record<string, string>> = {
    avif: "image/avif",
    bin: "application/octet-stream",
    bmp: "image/bmp",
    css: "text/css",
    csv: "text/csv",
    gif: "image/gif",
    gz: "application/gzip",
    html: "text/html",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    js: "text/javascript",
    json: "application/json",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    pdf: "application/pdf",
    png: "image/png",
    svg: "image/svg+xml",
    txt: "text/plain",
    wasm: "application/wasm",
    webp: "image/webp",
    zip: "application/zip"
}
