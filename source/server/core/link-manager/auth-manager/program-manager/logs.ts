import { DatabaseSync } from "node:sqlite"
import { existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"

/**
 * What a program's halves have said, kept.
 *
 * A program says something and it is kept. Server pipes arrive as raw
 * stdout and stderr; a client endpoint mirrors the console through its
 * private boundary. Neither is a request: recording is best-effort and
 * can never delay or disturb the program that produced it.
 *
 * Which is also why reading opens its own connection **read-only**. Not
 * a rule that a query must begin with `select`, which would mean parsing
 * SQL and being right about it forever — a property of the handle, which
 * the database enforces whatever arrives.
 *
 * It lives at `storage/logs.sqlite`, beside the `store.sqlite` this
 * copies: a thing the system manages, that the program has no word for,
 * that survives an update because everything under `storage` does, and
 * that goes with `uninstall(true)`. Nothing new had to be said anywhere
 * for any of that.
 *
 * **The system is the only writer.** Every process of every program
 * writes through the core, so nothing here contends and a line's rowid
 * is the order the system drained it — which is the only order it can
 * honestly claim, two pipes having no order between them.
 */
export default class Logs {

    private readonly path: string

    private writer: DatabaseSync | null = null

    private ready = false

    // What a process has said without a newline to end it. A pipe hands
    // over chunks that do not align to lines, so a line is complete when
    // the program says it is; the rest waits here for the next chunk or
    // for the end of the process, and neither of those is a clock.
    private readonly partial = new Map<string, string>()

    private readonly queued: LogRow[] = []

    private scheduled = false

    // How many rows a program keeps. Old ones go rather than a program
    // growing without end — bounded because this is a record of the
    // recent past, and a machine that fills its disk with what a chatty
    // program said is a machine that stops.
    private static readonly keeps = 20_000

    // Not every write: dropping the oldest is itself writes, so it is
    // paid every so often rather than per line, and the count is what
    // says when — a number of rows, not a length of time.
    private static readonly sweepEvery = 500

    private since = 0

    public constructor(path: string) {

        this.path = path
    }

    // Opened when there is something to say. A program that never runs
    // never gets a file, which is what makes an empty storage directory
    // stay empty.
    private open() {

        if (this.writer) return this.writer

        mkdirSync(dirname(this.path), { recursive: true })

        const database = new DatabaseSync(this.path)

        try {

            // Writes and reads do not block each other, and a reader sees a
            // consistent database while a program is mid-sentence.
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

            database.exec("create table logs (createdAt integer not null, process text not null, source text not null, kind text not null, content text not null)")

            database.exec("create index logs_process on logs (process)")

            return
        }

        const expected = ["createdAt", "process", "source", "kind", "content"]

        if (columns.map(column => column.name).join("\0") !== expected.join("\0")) throw new Error("The logs database has an unsupported schema")

        database.exec("create index if not exists logs_process on logs (process)")
    }

    // What arrived on a pipe, as lines. `\r\n` loses its carriage return
    // with its newline: both are the delimiter, and neither is what the
    // program printed.
    public printed(process: string, source: "stdout" | "stderr", chunk: string) {

        const held = `${this.partial.get(`${process}:${source}`) ?? ""}${chunk}`

        const lines = held.split("\n")

        this.partial.set(`${process}:${source}`, lines.pop() ?? "")

        this.enqueue(lines.map(line => [process, "server", source, line.endsWith("\r") ? line.slice(0, -1) : line] as const))
    }

    /** Keep one already-complete record without ever making logging a request. */
    public record(process: string, source: LogSource, kind: string, content: string) {

        this.enqueue([[process, source, kind, content]])
    }

    // The end of one endpoint incarnation, and the last thing said by it.
    //
    // Always last for that incarnation, which is a fact worth having even
    // though a later launch may append new rows for the same Process. What a
    // server was holding unfinished is put down first — an endpoint that
    // printed without a newline and then died said that, and it is often the
    // sentence that matters.
    public endpointExited(process: string, source: LogSource, code: number | null, signal: string | null) {

        const rest: LogRow[] = []

        for (const stream of source === "server" ? ["stdout", "stderr"] as const : [] as const) {

            const held = this.partial.get(`${process}:${stream}`)

            if (held) rest.push([process, "server", stream, held])

            this.partial.delete(`${process}:${stream}`)
        }

        this.enqueue([...rest, [process, source, "exit", JSON.stringify({ code, signal })]])
    }

    private enqueue(rows: LogRow[]) {

        if (!rows.length) return

        this.queued.push(...rows)

        if (this.scheduled) return

        this.scheduled = true

        queueMicrotask(() => {

            this.scheduled = false

            this.write(this.queued.splice(0))
        })
    }

    private write(rows: LogRow[]) {

        if (!rows.length) return

        try {

            const database = this.open()

            const at = Date.now()

            const insert = database.prepare("insert into logs (createdAt, process, source, kind, content) values (?, ?, ?, ?, ?)")

            for (const [process, source, kind, content] of rows) insert.run(at, process, source, kind, content)

            this.since += rows.length

            if (this.since >= Logs.sweepEvery) this.sweep(database)
        }

        // A log is never work the producer is waiting on. A full disk, a
        // closed database or a malformed file drops this emission and
        // changes nothing about the Process that produced it.
        catch { /* best-effort by contract */ }
    }

    private sweep(database: DatabaseSync) {

        this.since = 0

        // Everything older than the newest `keeps` rows. One statement,
        // so the whole drop is one transaction and a reader never sees
        // half of it.
        database.prepare("delete from logs where rowid <= (select rowid from logs order by rowid desc limit 1 offset ?)").run(Logs.keeps)
    }

    /**
     * Asked, and never told.
     *
     * The connection is read-only, so `insert`, `delete` and `create`
     * are refused by the database rather than by anything here reading
     * the SQL and deciding. A program may say whatever it likes; it
     * cannot change what it said.
     *
     * A fresh connection each time rather than one held open: a query is
     * a moment, and a reader that outlives its answer is a handle
     * somebody has to remember to close. Opening is cheap and the file
     * is local.
     */
    public query(sql: string, values: unknown[] = []) {

        // A program that has never printed has no file, and a read-only
        // connection will not make one. Answered with nothing, which is
        // what it said.
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

    // Closed because the file is about to go, or has. An open handle to
    // a deleted file is a handle to something nobody can reach, and the
    // next install would open a second one beside it.
    public close() {

        const writer = this.writer

        this.writer = null

        this.ready = false

        try { writer?.close() }

        catch { /* logging cleanup cannot obstruct Program cleanup */ }

        this.partial.clear()

        this.queued.length = 0

        this.scheduled = false
    }
}

export type LogSource = "client" | "server"

type LogRow = readonly [process: string, source: LogSource, kind: string, content: string]
