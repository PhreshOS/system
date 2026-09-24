import { DatabaseSync } from "node:sqlite"
import { existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import type { JsonValue, SystemLogLevel, SystemLogRecord } from "@phreshos/core"

type Listener = (record: SystemLogRecord) => unknown

/** Persistent System records and their live, post-commit event source. */
export default class SystemLogs {

    private writer: DatabaseSync | null = null

    private ready = false

    private readonly queued: PendingRecord[] = []

    private scheduled = false

    private since = 0

    private readonly listeners = new Set<Listener>()

    private static readonly keeps = 20_000

    private static readonly sweepEvery = 500

    public constructor(private readonly path: string) {}

    /** Record one intentional System fact without making its producer wait. */
    public record(level: SystemLogLevel, source: string, kind: string, content: string, data: JsonValue = null) {

        this.queued.push({ level, source, kind, content, data })

        if (this.scheduled) return

        this.scheduled = true

        queueMicrotask(() => {

            this.scheduled = false

            this.write(this.queued.splice(0))
        })
    }

    /** Observe records only after they have become queryable. */
    public subscribe(listener: Listener) {

        this.listeners.add(listener)

        return () => { this.listeners.delete(listener) }
    }

    public query(sql: string, values: unknown[] = []) {

        if (!existsSync(this.path)) return []

        if (!this.ready) {

            const writable = new DatabaseSync(this.path)

            try {

                this.prepare(writable)

                this.ready = true
            }

            finally { writable.close() }
        }

        const database = new DatabaseSync(this.path, { readOnly: true })

        try { return database.prepare(sql).all(...values as never[]).map(row => ({ ...row })) }

        finally { database.close() }
    }

    public close() {

        const writer = this.writer

        this.writer = null

        this.ready = false

        try { writer?.close() }

        catch { /* Closing logs cannot obstruct System shutdown. */ }

        this.queued.length = 0

        this.scheduled = false

        this.listeners.clear()
    }

    private open() {

        if (this.writer) return this.writer

        mkdirSync(dirname(this.path), { recursive: true })

        const database = new DatabaseSync(this.path)

        try {

            database.exec("pragma journal_mode = wal")

            this.prepare(database)
        }

        catch (exception) {

            database.close()

            throw exception
        }

        this.writer = database

        this.ready = true

        return database
    }

    private prepare(database: DatabaseSync) {

        const columns = database.prepare("pragma table_info(logs)").all() as { name: string }[]

        if (!columns.length) {

            database.exec("create table logs (createdAt integer not null, level text not null, source text not null, kind text not null, content text not null, data text not null)")

            database.exec("create index logs_level on logs (level)")

            database.exec("create index logs_source on logs (source)")

            return
        }

        const expected = ["createdAt", "level", "source", "kind", "content", "data"]

        if (columns.map(column => column.name).join("\0") !== expected.join("\0")) throw new Error("The System logs database has an unsupported schema")

        database.exec("create index if not exists logs_level on logs (level)")

        database.exec("create index if not exists logs_source on logs (source)")
    }

    private write(rows: PendingRecord[]) {

        if (!rows.length) return

        try {

            const database = this.open()

            const insert = database.prepare("insert into logs (createdAt, level, source, kind, content, data) values (?, ?, ?, ?, ?, ?)")

            for (const row of rows) {

                const record = Object.freeze({ createdAt: Date.now(), ...row }) satisfies SystemLogRecord

                insert.run(record.createdAt, record.level, record.source, record.kind, record.content, JSON.stringify(record.data))

                for (const listener of this.listeners) {

                    try { listener(record) }

                    catch { /* One listener cannot obstruct persistence or another listener. */ }
                }
            }

            this.since += rows.length

            if (this.since >= SystemLogs.sweepEvery) this.sweep(database)
        }

        // System logs are best-effort. If their own storage fails, preserve the
        // intended records on stderr without turning logging into System work.
        catch (exception) {

            for (const row of rows) {

                try { process.stderr.write(`${JSON.stringify({ createdAt: Date.now(), ...row })}\n`) }

                catch { /* No further logging path exists. */ }
            }

            void exception
        }
    }

    private sweep(database: DatabaseSync) {

        this.since = 0

        database.prepare("delete from logs where rowid <= (select rowid from logs order by rowid desc limit 1 offset ?)").run(SystemLogs.keeps)
    }
}

type PendingRecord = Readonly<{
    level: SystemLogLevel
    source: string
    kind: string
    content: string
    data: JsonValue
}>
