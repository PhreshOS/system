import Program from "./program"
import type { Permissions, ProgramSnapshot } from "@phreshos/core"

/**
 * One program in the runtime registry. Installation is a state of this
 * same record, never membership in a second collection.
 */
export default class Entry {

    public readonly program: Program

    public installed: boolean

    /** Restore the durable installed Program when this runtime overlay ends. */
    public restoreInstalled: boolean

    private permissionState: Permissions

    public constructor(program: Program, permissions: Permissions, installed = true, restoreInstalled = false) {

        this.program = program

        this.permissionState = clonePermissions(permissions)

        this.installed = installed

        this.restoreInstalled = restoreInstalled
    }

    public permissions() {

        return clonePermissions(this.permissionState)
    }

    public updatePermissions(permissions: Permissions) {

        this.permissionState = clonePermissions(permissions)
    }

    public get identity() {

        return this.program.identity
    }

    // What crosses: what a program says it is, and what a session needs
    // to draw it. Never a path — a browser has no disk, and where this
    // machine put things is not a program's own word about itself.
    public record() {

        return {

            ...this.program.record(),

            permissions: this.permissions(),

            installed: this.installed
        } satisfies ProgramSnapshot & { permissions: Permissions }
    }

    public toJSON() {

        return this.record()
    }
}

export type ProgramRecord = ReturnType<Entry["record"]>

function clonePermissions(permissions: Permissions): Permissions {

    return Object.fromEntries(Object.entries(permissions).map(([name, permission]) => [
        name,
        Array.isArray(permission) ? [...permission] : permission
    ]))
}
