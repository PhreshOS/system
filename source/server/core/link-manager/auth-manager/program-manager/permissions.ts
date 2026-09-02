import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import type Program from "./program"
import { permissionCatalog } from "@server/core/permissions"
import type { Permissions } from "@phreshos/core"

const file = "permissions.json"

/** Reads one Program's system-managed persistent user grants. */
export function readPermissions(program: Program): Permissions {

    const path = join(program.storagePath, file)

    if (!existsSync(path)) return {}

    try { return permissionCatalog.stored(JSON.parse(readFileSync(path, "utf8"))) }

    catch (exception) {

        if (exception instanceof SyntaxError) throw new Error("The Program permissions file is invalid")

        throw exception
    }
}

/** Atomically replaces one Program's persistent user grants. */
export function writePermissions(program: Program, permissions: Permissions) {

    mkdirSync(program.storagePath, { recursive: true })

    const path = join(program.storagePath, file)
    const temporary = join(program.storagePath, `.${file}.${randomUUID()}`)

    try {

        writeFileSync(temporary, `${JSON.stringify(permissions, null, 2)}\n`)
        renameSync(temporary, path)
    }
    finally { rmSync(temporary, { force: true }) }
}
