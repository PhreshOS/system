import { EventEmitter } from "node:events"
import { DatabaseSync } from "node:sqlite"
import { type KeyvStoreAdapter, type StoredData } from "keyv"

/** A Keyv store backed directly by Node's built-in SQLite driver. */
export default class SqliteStore extends EventEmitter implements KeyvStoreAdapter {

    public readonly opts = { dialect: "sqlite" }

    public namespace?: string

    private readonly database: DatabaseSync

    public constructor(path: string) {

        super()

        this.database = new DatabaseSync(path)

        this.database.exec("pragma journal_mode = wal; pragma busy_timeout = 5000")

        // This is the schema used by @keyv/sqlite. Keeping it unchanged makes
        // the driver replacement transparent to every existing store file.
        this.database.exec("create table if not exists keyv (key varchar(255) primary key, value text)")
    }

    public async get<Value>(key: string) {

        const row = this.database.prepare("select value from keyv where key = ?").get(key) as { value: string } | undefined

        return row?.value as StoredData<Value> | undefined
    }

    public async set(key: string, value: unknown) {

        this.database.prepare("insert into keyv (key, value) values (?, ?) on conflict(key) do update set value = excluded.value").run(key, value as string)
    }

    public async delete(key: string) {

        const result = this.database.prepare("delete from keyv where key = ?").run(key)

        return Number(result.changes) > 0
    }

    public async clear() {

        if (!this.namespace) {

            this.database.exec("delete from keyv")

            return
        }

        const prefix = `${this.namespace}:`

        this.database.prepare("delete from keyv where substr(key, 1, ?) = ?").run(prefix.length, prefix)
    }

    public async has(key: string) {

        return this.database.prepare("select 1 from keyv where key = ?").get(key) !== undefined
    }

    public async disconnect() {

        this.database.close()
    }
}
