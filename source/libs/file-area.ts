import { createReadStream, createWriteStream, lstatSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { rm } from "node:fs/promises"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { type ReadableStream as NodeReadableStream } from "node:stream/web"

/** File operations structurally confined to one root directory. */
export default class FileArea {

    public readonly path: string

    public readonly label: string

    public constructor(path: string, label = "this area") {

        this.path = path

        this.label = label

        mkdirSync(path, { recursive: true })
    }

    public resolve(joins: string[]) {

        const path = join(this.path, ...joins)

        const step = relative(this.path, path)

        if (step === ".." || step.startsWith(`..${sep}`) || isAbsolute(step)) throw new Error("A storage path may not leave its configured directory")

        let current = this.path

        for (const part of step.split(sep).filter(Boolean)) {

            current = join(current, part)

            try {

                if (lstatSync(current).isSymbolicLink()) throw new Error("A storage path may not pass through a symbolic link")
            }

            catch (exception) {

                if ((exception as NodeJS.ErrnoException).code === "ENOENT") break

                throw exception
            }
        }

        return path
    }

    public clear(joins: string[] = []) {

        const path = this.resolve(joins)

        const found = this.stat(joins)

        if (found && found.kind !== "directory") throw new Error("Only a storage directory can be cleared")

        rmSync(path, { recursive: true, force: true })

        mkdirSync(path, { recursive: true })
    }

    public stat(joins: string[]): EntryStat | null {

        let found

        try {

            found = statSync(this.resolve(joins))
        }

        catch (exception) {

            if ((exception as NodeJS.ErrnoException).code === "ENOENT") return null

            throw exception
        }

        const modifiedAt = Math.round(found.mtimeMs)

        if (found.isFile()) return { kind: "file", size: found.size, modifiedAt }

        if (found.isDirectory()) return { kind: "directory", modifiedAt }

        return { kind: "other", modifiedAt }
    }

    public list(joins: string[]) {

        return readdirSync(this.resolve(joins)).sort()
    }

    public delete(joins: string[]) {

        if (joins.length === 0) throw new Error("Emptying a place is clear, not delete")

        rmSync(this.resolve(joins), { recursive: true, force: true })
    }

    public stream(joins: string[]) {

        const found = this.stat(joins)

        if (!found) throw new MissingAreaEntryError(`There is no ${joins.join("/")} in ${this.label}`)

        if (found.kind !== "file") throw new NotFileError(`${joins.join("/")} is not a file`)

        return Readable.toWeb(createReadStream(this.resolve(joins))) as ReadableStream<Uint8Array>
    }

    public async write(joins: string[], content: ReadableStream<Uint8Array> | null, signal?: AbortSignal) {

        if (joins.length === 0) throw new Error("Writing takes a file name and what to write")

        if (!content) throw new Error("Writing takes a byte stream")

        const path = this.resolve(joins)

        mkdirSync(dirname(path), { recursive: true })

        const temporary = join(dirname(path), `.${randomUUID()}.writing`)

        try {

            await pipeline(

                Readable.fromWeb(content as unknown as NodeReadableStream<Uint8Array>),

                createWriteStream(temporary, { flags: "wx" }),

                { signal }
            )

            renameSync(temporary, path)
        }

        catch (exception) {

            await rm(temporary, { force: true }).catch(() => undefined)

            throw exception
        }
    }
}

/** Native filesystem access resolved from one entry point without confinement. */
export class FileSystem extends FileArea {

    public override resolve(joins: string[]) {

        return resolve(this.path, ...joins)
    }
}

export type EntryStat = FileStat | DirectoryStat | OtherStat

export interface FileStat {

    kind: "file"

    size: number

    modifiedAt: number
}

export interface DirectoryStat {

    kind: "directory"

    modifiedAt: number
}

export interface OtherStat {

    kind: "other"

    modifiedAt: number
}

export class MissingAreaEntryError extends Error { }

export class NotFileError extends Error { }
