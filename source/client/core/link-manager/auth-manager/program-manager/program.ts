import { HostedEntry } from "@server/core/link-manager/auth-manager/program-manager/entry"
import { Launch } from "@server/core/link-manager/auth-manager/program-manager/program-manager"
import ProgramManager from "./program-manager"

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

    public readonly assetId: string

    public readonly name: string

    public readonly version: string | null

    public readonly description: string | null

    public readonly server: HostedEntry["server"]

    public readonly client: HostedEntry["client"]

    public constructor(programManager: ProgramManager, payload: HostedEntry) {

        this.programManager = programManager

        this.identity = payload.identity

        this.reference = payload.reference

        this.installed = payload.installed

        this.assetId = payload.assetId

        this.name = payload.name

        this.version = payload.version

        this.description = payload.description

        this.server = payload.server

        this.client = payload.client
    }

    public async createProcess(launch: Launch = {}) {

        await this.programManager.$outbound.publish("/create-process", this.identity, launch)
    }

    public async install(asker: string) {

        await this.programManager.install(this.identity, asker)
    }

    // False removes only installed program files. True removes everything
    // owned by the system and forgets the runtime Program.
    public async uninstall(everything = false, asker = "") {

        await this.programManager.uninstall(this.identity, everything, asker)
    }

    public async forget(asker: string) {

        await this.programManager.forget(this.identity, asker)
    }
}
