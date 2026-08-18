import { DatabaseSync } from "node:sqlite"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"

/** A lazily opened SQLite database exposing one-statement queries. */
export default class SqliteDatabase {

    private readonly path: string

    private database: DatabaseSync | null = null

    public constructor(path: string) {

        this.path = path
    }

    private open() {

        if (this.database) return this.database

        mkdirSync(dirname(this.path), { recursive: true })

        const database = new DatabaseSync(this.path)

        database.exec("pragma journal_mode = wal")

        this.database = database

        return database
    }

    /** Execute exactly one statement and return its rows. */
    public query(sql: string, values: unknown[] = []) {

        const statement = this.open().prepare(sql)

        const rest = sql.slice(statement.sourceSQL.length).trim()

        if (rest) throw new Error(`A query is one statement, and this is more than one — the rest was not run: ${rest.slice(0, 60)}`)

        return statement.all(...values as never[]).map(row => ({ ...row }))
    }

    public close() {

        this.database?.close()

        this.database = null
    }
}
