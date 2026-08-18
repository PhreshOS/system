import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import type Program from "./program"
import { isPermissionName, type PermissionDecisions } from "@phreshos/core"

const file = "permissions.json"

/** Reads one Program's system-managed persistent permission decisions. */
export function readPermissions(program: Program): PermissionDecisions {
    const path = join(program.storagePath, file)

    if (!existsSync(path)) return {}

    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("The Program permissions file is invalid")

    const entries = Object.entries(parsed)

    const permissions: PermissionDecisions = {}

    for (const [name, value] of entries) {

        if (!isPermissionName(name) || typeof value !== "boolean") throw new Error("The Program permissions file is invalid")

        permissions[name] = value
    }

    return permissions
}

/** Atomically replaces one Program's persistent permission decisions. */
export function writePermissions(program: Program, permissions: PermissionDecisions) {

    mkdirSync(program.storagePath, { recursive: true })

    const path = join(program.storagePath, file)
    const temporary = join(program.storagePath, `.${file}.${randomUUID()}`)

    try {
        writeFileSync(temporary, `${JSON.stringify(permissions, null, 2)}\n`)
        renameSync(temporary, path)
    }
    finally { rmSync(temporary, { force: true }) }
}
