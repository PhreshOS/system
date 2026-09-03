import type AuthManager from "@client/core/link-manager/auth-manager/auth-manager"
import type Program from "@client/core/link-manager/auth-manager/program-manager/program"
import type Process from "@client/core/link-manager/auth-manager/process-manager/process"
import type { ServiceKey } from "@phreshos/core"

const denied = "Execution is not permitted"

/** The System authority available to one structurally identified Client frame. */
export default class SystemAccess {

    public constructor(private readonly authManager: AuthManager, private readonly pane: string) { }

    public ownsProgram(program: Pick<Program, "identity">) {

        return this.owner().program === program.identity
    }

    public ownsProcess(process: Pick<Process, "program">) {

        return this.owner().program === process.program
    }

    public serviceProgram(service: ServiceKey) {

        return service.program ?? this.authManager.processManager.processes.get(service.process)?.program ?? null
    }

    public ownsService(service: ServiceKey) {

        return this.serviceProgram(service) === this.owner().program
    }

    public async all() {

        return await this.authManager.grantsPermission(this.pane, "all", [])
    }

    public async program(program: Program) {

        if (!this.ownsProgram(program) && !await this.all()) throw new Error(denied)

        return program
    }

    public async process(process: Process) {

        if (!this.ownsProcess(process) && !await this.all()) throw new Error(denied)

        return process
    }

    public async service(service: ServiceKey) {

        if (!this.ownsService(service) && !await this.all()) throw new Error(denied)

        return service
    }

    public async requireAll() {

        if (!await this.all()) throw new Error(denied)
    }

    private owner() {

        const process = this.authManager.processManager.processes.get(this.pane)

        if (!process) throw new Error("The desktop does not know this process")

        return process
    }
}
