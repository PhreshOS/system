import { Transmitted } from "@libs/messagepack"
import Program from "./program"

/**
 * One program in the runtime registry. Installation is a state of this
 * same record, never membership in a second collection.
 */
export default class Entry {

    public readonly program: Program

    public installed: boolean

    /** Restore the durable installed Program when this runtime overlay ends. */
    public restoreInstalled: boolean

    public constructor(program: Program, installed = true, restoreInstalled = false) {

        this.program = program

        this.installed = installed

        this.restoreInstalled = restoreInstalled
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

            installed: this.installed
        }
    }

    public toJSON() {

        return this.record()
    }
}

export type ProgramRecord = ReturnType<Entry["record"]>

export type TransmittedEntry = Transmitted<ProgramRecord>
