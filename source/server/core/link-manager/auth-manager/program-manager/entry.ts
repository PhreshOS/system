import { Transmitted } from "@libs/superjson"
import Program from "./program"

/**
 * One program in the runtime registry. Installation is a state of this
 * same record, never membership in a second collection.
 */
export default class Entry {

    public readonly program: Program

    public installed: boolean

    public constructor(program: Program, installed = true) {

        this.program = program

        this.installed = installed
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

    // Only the trusted desktop needs the private route that hosts this
    // program's files. It is deliberately absent from `toJSON`, which is
    // also what crosses into program SDKs.
    public hosted() {

        return { ...this.record(), assetId: this.program.assetId }
    }

    public toJSON() {

        return this.record()
    }
}

export type ProgramRecord = ReturnType<Entry["record"]>

export type HostedEntry = ReturnType<Entry["hosted"]>

export type TransmittedEntry = Transmitted<ProgramRecord>
