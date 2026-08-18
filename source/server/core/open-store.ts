import { mkdirSync } from "node:fs"
import { join } from "node:path"
import Keyv from "keyv"
import SqliteStore from "@libs/sqlite-store"

/** Open the persistent key-value store in an owned directory. */
export default function openStore(directory: string) {

    mkdirSync(directory, { recursive: true })

    return new Keyv(new SqliteStore(join(directory, "store.sqlite")))
}
