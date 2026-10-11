import Program from "./program"
import ProgramStateStorage from "./state"
import type { Permissions, ProgramSnapshot } from "@phreshos/core"

/**
 * One program in the runtime registry. Installation is a state of this
 * same record, never membership in a second collection.
 */
export default class Entry {

    public readonly program: Program

    /** When it was first installed, as an ISO time; `null` without an installed form, as one run from a project. */
    public installedAt: string | null

    /** Restore the durable installed Program when this runtime overlay ends. */
    public restoreInstalled: boolean

    private permissionState: Permissions

    public constructor(program: Program, permissions: Permissions, installed = true, restoreInstalled = false) {

        this.program = program

        this.permissionState = clonePermissions(permissions)

        this.installedAt = installed ? new ProgramStateStorage(program).settleInstalledAt() : null

        this.restoreInstalled = restoreInstalled
    }

    /** Whether it has an installed form. */
    public get installed() {

        return this.installedAt !== null
    }

    /** It now has an installed form: its first install time, kept from before or recorded now. */
    public markInstalled() {

        this.installedAt = new ProgramStateStorage(this.program).settleInstalledAt()
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

            installedAt: this.installedAt,

            // Whether it starts with the System, so a list can be filtered
            // where it is held. The launch itself stays behind `startup.get()`.
            startup: new ProgramStateStorage(this.program).startup() !== null,

            // When it was pinned to the Taskbar, which orders it there; `null` when it is not.
            pinnedAt: new ProgramStateStorage(this.program).pinnedAt()
        } satisfies ProgramSnapshot & { permissions: Permissions, startup: boolean, pinnedAt: string | null }
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
