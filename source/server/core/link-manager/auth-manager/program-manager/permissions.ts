import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import type Program from "./program"
import { permissionCatalog } from "@server/core/permissions"
import type { Permissions } from "@phreshos/core"

const file = "permissions.json"

/** Applies declared entries, retaining unrelated stored permissions and rollback bytes. */
export function applyDeclaredPermissions(program: Program): (() => void) | undefined {
    const declared = program.declaredPermissions
    if (Object.keys(declared).length === 0) return undefined

    const path = join(program.storagePath, file)
    const previous = existsSync(path) ? readFileSync(path) : null
    const stored = previous === null ? {} : permissionCatalog.stored(JSON.parse(previous.toString("utf8")))
    writePermissions(program, { ...stored, ...declared })

    return () => {
        if (previous === null) rmSync(path, { force: true })
        else atomicWrite(program.storagePath, path, previous)
    }
}

/** Reads one Program's authoritative permission state. */
export function readPermissions(program: Program): Permissions {

    const path = join(program.storagePath, file)

    if (!existsSync(path)) return {}

    try { return permissionCatalog.stored(JSON.parse(readFileSync(path, "utf8"))) }

    catch (exception) {

        if (exception instanceof SyntaxError) throw new Error("The Program permissions file is invalid")

        throw exception
    }
}

/** Atomically replaces one Program's authoritative permission state. */
export function writePermissions(program: Program, permissions: Permissions) {

    const directory = program.storagePath
    const path = join(directory, file)
    atomicWrite(directory, path, Buffer.from(`${JSON.stringify(permissions, null, 2)}\n`))
}

function atomicWrite(directory: string, path: string, content: Uint8Array) {

    mkdirSync(directory, { recursive: true })

    const temporary = join(directory, `.${file}.${randomUUID()}`)

    try {

        writeFileSync(temporary, content)
        renameSync(temporary, path)
    }
    finally { rmSync(temporary, { force: true }) }
}
