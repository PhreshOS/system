import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import type Program from "./program"
import { permissionCatalog } from "@server/core/permissions"
import type { Permissions } from "@phreshos/core"

const file = "permissions.json"

/** Replaces runtime permission state with this installation's declaration. */
export function installPermissions(program: Program) {

    const directory = program.storagePath
    const path = join(directory, file)
    const directoryExisted = existsSync(directory)
    const previous = existsSync(path) ? readFileSync(path) : null

    writePermissions(program, program.installationPermissions)

    return function rollbackPermissionInstallation() {

        if (previous === null) rmSync(path, { force: true })
        else atomicWrite(directory, path, previous)

        if (!directoryExisted && existsSync(directory) && readdirSync(directory).length === 0) {
            rmSync(directory, { recursive: true, force: true })
        }
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
