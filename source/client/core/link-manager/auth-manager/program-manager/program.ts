import { ProgramRecord } from "@server/core/link-manager/auth-manager/program-manager/entry"
import { type Launch } from "@phreshos/core"
import ProgramManager from "./program-manager"
import type { Transmitted } from "@libs/messagepack"

/**
 * A program this session knows about, rebuilt from what the core
 * transmitted. What it holds is what a program says of itself and what
 * is needed to draw it — never a path, because this side has no disk
 * and where the machine put things is not a program's own word.
 *
 * Running it is a request; the process appears when its start echoes.
 */
export default class Program {

    public readonly programManager: ProgramManager

    public readonly identity: string

    /** Opaque identity of this runtime Program entity. */
    public readonly reference: string

    public readonly installed: boolean

    public readonly name: string

    public readonly version: string | null

    public readonly description: string | null

    public readonly hasAgent: boolean

    public readonly server: Transmitted<ProgramRecord>["server"]

    public readonly client: Transmitted<ProgramRecord>["client"]

    public constructor(programManager: ProgramManager, payload: Transmitted<ProgramRecord>) {

        this.programManager = programManager

        this.identity = payload.identity

        this.reference = payload.reference

        this.installed = payload.installed

        this.name = payload.name

        this.version = payload.version

        this.description = payload.description

        this.hasAgent = payload.hasAgent

        this.server = payload.server

        this.client = payload.client
    }

    public async createProcess(launch: Launch = {}) {

        await this.programManager.$outbound.publish("/create-process", this.address, launch)
    }

    public install(asker: string) {

        return this.programManager.command(this.address, "install", undefined, asker)
    }

    // False removes only installed program files. True removes everything
    // owned by the system and forgets the runtime Program.
    public uninstall(everything = false, asker = "") {

        return this.programManager.command(this.address, "uninstall", everything, asker)
    }

    public async forget(asker: string) {

        await this.programManager.forget(this.address, asker)
    }

    private get address() {

        return { identity: this.identity, reference: this.reference }
    }
}
