import { createWriteStream, mkdirSync, statSync } from "node:fs"
import FileManager from "@libs/file-manager"
import { rename, rm } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { type ReadableStream as NodeReadableStream } from "node:stream/web"

export const serveLimit = 1024 * 1024 * 1024

export class MissingServedValueError extends Error {

    public constructor() {

        super("A value is required")
    }
}

export class ServedValueTooLargeError extends Error {

    public constructor() {

        super(`The served value exceeds ${serveLimit / 1024 / 1024 / 1024} GB`)
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
const shape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/

export default class ServedFileManager {

    public readonly fileManager: FileManager

    public constructor(fileManager: FileManager) {

        this.fileManager = fileManager

        mkdirSync(fileManager.path, { recursive: true })
    }

    public path(file: string) {

        if (!shape.test(file)) throw new Error("That is not a served file")

        return this.fileManager.join(file)
    }

    public async write(extension: string, content: ReadableStream<Uint8Array> | null, signal?: AbortSignal) {

        if (!/^[a-z0-9]+$/.test(extension)) throw new Error("A served file needs a valid extension")

        if (!content) throw new MissingServedValueError()

        const uuid = randomUUID()

        const file = `${uuid}.${extension}`

        const temporary = this.fileManager.join(`.${uuid}.serving`)

        let size = 0

        try {

            await pipeline(

                Readable.fromWeb(content as unknown as NodeReadableStream<Uint8Array>),

                async function* (source: AsyncIterable<Uint8Array>) {

                    for await (const chunk of source) {

                        size += chunk.byteLength

                        if (size > serveLimit) throw new ServedValueTooLargeError()

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

    public describe(file: string) {

        const stat = statSync(this.path(file))

        return { file, size: stat.size, time: Math.round(stat.mtimeMs) }
    }

}
