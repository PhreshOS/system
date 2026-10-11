import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { parseLaunch, type Launch, type Permission, type PermissionName, type Permissions } from "@phreshos/core"
import { permissionCatalog } from "@server/core/permissions"
import type Program from "./program"

const file = "state.json"

/** System-managed Program state sharing one atomic persistence boundary. */
export default class ProgramStateStorage {

    public constructor(private readonly program: Program) {}

    public startup(): Launch | null {
        const value = this.read().startup
        return value === undefined ? null : parseLaunch(value)
    }

    public setStartup(value: Launch | null) {
        this.change(state => {
            if (value === null) delete state.startup
            else state.startup = parseLaunch(value)
        })
    }

    public permissions(): Permissions {
        return permissionCatalog.stored(this.read().permissions ?? {})
    }

    public setPermission<Name extends PermissionName>(name: Name, value: Exclude<Permission<Name>, null>) {
        this.change(state => {
            const permissions = permissionCatalog.stored(state.permissions ?? {})
            state.permissions = { ...permissions, [name]: value }
        })
    }

    public removePermission(name: PermissionName) {
        this.change(state => {
            const { [name]: _removed, ...permissions } = permissionCatalog.stored(state.permissions ?? {})
            state.permissions = permissions
        })
    }

    /** When the Program was first installed, as an ISO time; `null` before it ever was. */
    public installedAt(): string | null {
        const value = this.read().installedAt
        if (value === undefined) return null
        if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error("The Program state contains an invalid install time")
        return value
    }

    /** Records the first install, once: later installs over the same data keep its time. */
    public settleInstalledAt(): string {
        const known = this.installedAt()
        if (known !== null) return known
        const now = new Date().toISOString()
        this.change(state => { state.installedAt = now })
        return now
    }

    /** When the Program was pinned, as an ISO time; `null` when it is not. */
    public pinnedAt(): string | null {
        const value = this.read().pinnedAt
        if (value === undefined) return null
        if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error("The Program state contains an invalid pin time")
        return value
    }

    public setPinnedAt(value: string | null) {
        this.change(state => {
            if (value === null) delete state.pinnedAt
            else state.pinnedAt = value
        })
    }

    private read(): Record<string, unknown> {
        const path = join(this.program.storagePath, file)
        if (!existsSync(path)) return {}

        try {
            const value: unknown = JSON.parse(readFileSync(path, "utf8"))
            if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error()
            return { ...value }
        }
        catch {
            throw new Error("The Program state file is invalid")
        }
    }

    private change(change: (state: Record<string, unknown>) => void) {
        const state = this.read()
        change(state)

        const directory = this.program.storagePath
        const path = join(directory, file)
        const temporary = join(directory, `.${file}.${randomUUID()}`)

        // Sibling state fields must cross one atomic boundary so an interrupted
        // startup or permission change cannot discard independently owned state.
        mkdirSync(directory, { recursive: true })
        try {
            writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`)
            renameSync(temporary, path)
        }
        finally { rmSync(temporary, { force: true }) }
    }
}
