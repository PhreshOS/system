import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import type Program from "./program"

const file = "startup.json"

/** Read the system-managed startup declaration without interpreting it. */
export function readStartup(program: Program): unknown | null {

    const path = join(program.storagePath, file)

    if (!existsSync(path)) return null

    return JSON.parse(readFileSync(path, "utf8")) as unknown
}

/** Atomically replace one Program's system-managed startup declaration. */
export function writeStartup(program: Program, launch: unknown) {

    mkdirSync(program.storagePath, { recursive: true })

    const path = join(program.storagePath, file)

    const temporary = join(program.storagePath, `.${file}.${randomUUID()}`)

    try {

        writeFileSync(temporary, `${JSON.stringify(launch, null, 2)}\n`)

        renameSync(temporary, path)
    }

    finally { rmSync(temporary, { force: true }) }
}

/** Disable startup without touching any other Program storage. */
export function removeStartup(program: Program) {

    rmSync(join(program.storagePath, file), { force: true })
}
