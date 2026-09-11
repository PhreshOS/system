import { createReadStream, createWriteStream, linkSync, lstatSync, mkdirSync, readdirSync, renameSync, rmSync, statfsSync, statSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { rm, watch as watchPath } from "node:fs/promises"
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

    public name(joins: string[] = []) {

        const path = this.resolve(joins)

        return basename(path) || path
    }

    public create(joins: string[] = []) {

        mkdirSync(this.resolve(joins), { recursive: true })
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

    public list(joins: string[], options: StorageListOptions = []) {

        const [recursive = false, configuredDepth] = options

        if (configuredDepth !== undefined && (!Number.isSafeInteger(configuredDepth) || configuredDepth < 0)) {

            throw new Error("A Storage list depth must be a non-negative safe integer")
        }

        if (configuredDepth !== undefined && !recursive) throw new Error("A Storage list depth requires recursive listing")

        const depth = recursive ? configuredDepth ?? Number.POSITIVE_INFINITY : 1

        const entries: StorageEntry[] = []

        this.collect(joins, [], depth, entries)

        return entries
    }

    private collect(joins: string[], relative: string[], depth: number, entries: StorageEntry[]) {

        if (depth === 0) return

        for (const name of readdirSync(this.resolve([...joins, ...relative])).sort()) {

            const path = [...relative, name]

            const found = this.stat([...joins, ...path])

            if (!found) continue

            if (found.kind === "other") throw new Error(`${this.resolve([...joins, ...path])} is neither a file nor a Storage directory`)

            entries.push({ kind: found.kind === "directory" ? "storage" : "file", path })

            if (found.kind === "directory" && depth > 1) this.collect(joins, path, depth - 1, entries)
        }
    }

    public delete(joins: string[]) {

        if (joins.length === 0) throw new Error("Emptying a place is clear, not delete")

        rmSync(this.resolve(joins), { recursive: true, force: true })
    }

    public stream(joins: string[], options: StorageReadOptions = []) {

        const found = this.stat(joins)

        if (!found) throw new MissingAreaEntryError(`There is no ${joins.join("/")} in ${this.label}`)

        if (found.kind !== "file") throw new NotFileError(`${joins.join("/")} is not a file`)

        const [offset = 0, length] = options

        if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("A Storage read offset must be a non-negative safe integer")

        if (length !== undefined && (!Number.isSafeInteger(length) || length < 0)) throw new Error("A Storage read length must be a non-negative safe integer")

        if (length !== undefined && !Number.isSafeInteger(offset + length)) throw new Error("A Storage byte range must use safe integers")

        if (length === 0) return new ReadableStream<Uint8Array>({ start(controller) { controller.close() } })

        return Readable.toWeb(createReadStream(this.resolve(joins), {

            start: offset,

            ...(length === undefined ? {} : { end: offset + length - 1 })
        })) as ReadableStream<Uint8Array>
    }

    public async write(joins: string[], content: ReadableStream<Uint8Array> | null, signal?: AbortSignal, overwrite = true) {

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

            if (overwrite) renameSync(temporary, path)

            else {

                linkSync(temporary, path)

                rmSync(temporary, { force: true })
            }
        }

        catch (exception) {

            await rm(temporary, { force: true }).catch(() => undefined)

            throw exception
        }
    }

    public async append(joins: string[], content: ReadableStream<Uint8Array> | null, signal?: AbortSignal) {

        if (joins.length === 0) throw new Error("Appending takes a file name and what to append")

        if (!content) throw new Error("Appending takes a byte stream")

        const path = this.resolve(joins)

        mkdirSync(dirname(path), { recursive: true })

        await pipeline(

            Readable.fromWeb(content as unknown as NodeReadableStream<Uint8Array>),

            createWriteStream(path, { flags: "a" }),

            { signal }
        )
    }

    public space(joins: string[] = []) {

        const value = statfsSync(this.resolve(joins))

        const capacity = value.blocks * value.bsize

        const available = value.bavail * value.bsize

        return { capacity, available, used: capacity - value.bfree * value.bsize }
    }

    public async *watch(joins: string[] = [], recursive = false, signal?: AbortSignal) {

        for await (const change of watchPath(this.resolve(joins), { recursive, signal })) {

            yield { event: change.eventType, path: change.filename === null ? null : String(change.filename) } as const
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

export interface StorageEntry {

    kind: "storage" | "file"

    path: string[]
}

export type StorageListOptions = [recursive?: boolean, depth?: number]

export type StorageReadOptions = [offset?: number, length?: number]

export class MissingAreaEntryError extends Error { }

export class NotFileError extends Error { }
