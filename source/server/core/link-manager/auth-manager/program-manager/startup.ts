import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import type Program from "./program"
import { parseLaunch, type Launch } from "@phreshos/core"

const file = "startup.json"

/** Read and validate the stored launch without resolving Program defaults. */
export function readStartup(program: Program): Launch | null {

    const path = join(program.storagePath, file)

    if (!existsSync(path)) return null

    return parseLaunch(JSON.parse(readFileSync(path, "utf8")))
}

/** Atomically replace one Program's system-managed startup declaration. */
export function writeStartup(program: Program, launch: Launch) {

    write(program, `${JSON.stringify(launch, null, 2)}\n`)
}

function write(program: Program, content: string | Uint8Array) {

    mkdirSync(program.storagePath, { recursive: true })

    const path = join(program.storagePath, file)

    const temporary = join(program.storagePath, `.${file}.${randomUUID()}`)

    try {

        writeFileSync(temporary, content)

        renameSync(temporary, path)
    }

    finally { rmSync(temporary, { force: true }) }
}

/** Installation replaces startup, including an omitted or disabled declaration. */
export function installStartup(program: Program, launch: Launch | null) {

    const path = join(program.storagePath, file)
    const previous = existsSync(path) ? readFileSync(path) : null

    if (launch === null) removeStartup(program)
    else writeStartup(program, launch)

    return function rollbackStartupInstallation() {
        if (previous === null) removeStartup(program)
        else write(program, previous)
    }
}

/** Disable startup without touching any other Program storage. */
export function removeStartup(program: Program) {

    rmSync(join(program.storagePath, file), { force: true })
}
