import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { isDeepStrictEqual } from "node:util"
import { parseLaunch, type Launch } from "@phreshos/core"
import type Program from "./program"

/** Persistent launch intent, without resolving Program defaults or executing it. */
export default class LaunchStorage {
    public constructor(private readonly program: Program, private readonly name: "startup" | "launch") {}

    public get(): Launch | null {
        if (!existsSync(this.path)) return null
        return parseLaunch(JSON.parse(readFileSync(this.path, "utf8")))
    }

    public set(launch: Launch) {
        const parsed = parseLaunch(launch)
        let current: Launch | null = null

        try { current = this.get() }
        catch { /* A valid replacement repairs an invalid stored declaration. */ }

        if (isDeepStrictEqual(current, parsed)) return

        this.write(`${JSON.stringify(parsed, null, 2)}\n`)
    }

    /** Replace one declaration, retaining exact bytes for operation rollback. */
    public replace(launch: Launch) {
        const previous = existsSync(this.path) ? readFileSync(this.path) : null
        this.set(launch)
        return () => {
            if (previous === null) this.remove()
            else this.write(previous)
        }
    }

    public remove() {
        rmSync(this.path, { force: true })
    }

    private get path() {
        return join(this.program.storagePath, `${this.name}.json`)
    }

    private write(content: string | Uint8Array) {
        mkdirSync(this.program.storagePath, { recursive: true })
        const temporary = join(this.program.storagePath, `.${this.name}.json.${randomUUID()}`)
        try {
            writeFileSync(temporary, content)
            renameSync(temporary, this.path)
        }
        finally { rmSync(temporary, { force: true }) }
    }
}
