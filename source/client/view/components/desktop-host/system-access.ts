import type AuthManager from "@client/core/link-manager/auth-manager/auth-manager"
import type Program from "@client/core/link-manager/auth-manager/program-manager/program"
import type Process from "@client/core/link-manager/auth-manager/process-manager/process"
import { parseLaunch, type ClientLaunch, type PermissionName, type PermissionValue, type ServiceKey } from "@phreshos/core"

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

    public async all() {

        return await this.authManager.grantsPermission(this.pane, "all", [])
    }

    public async canProgram(program: Pick<Program, "identity">) {

        return this.ownsProgram(program)
            || await this.authManager.grantsPermission(this.pane, "programs", [program.identity])
    }

    public async canProcess(process: Pick<Process, "program">) {

        return this.ownsProcess(process)
            || await this.authManager.grantsPermission(this.pane, "programs", [process.program])
    }

    public async canService(service: ServiceKey) {

        const program = this.serviceProgram(service)

        if (program !== null && this.owner().program === program) return true

        return await this.authManager.grantsPermission(this.pane, "services", program === null ? [] : [program])
    }

    public async program(program: Program) {

        if (!await this.canProgram(program)) throw new Error(denied)

        return program
    }

    public async process<Subject extends Pick<Process, "program">>(process: Subject) {

        if (!await this.canProcess(process)) throw new Error(denied)

        return process
    }

    public async service(service: ServiceKey) {

        if (!await this.canService(service)) throw new Error(denied)

        return service
    }

    public async requireAll() {

        if (!await this.all()) throw new Error(denied)
    }

    /** Authorize the layer explicitly selected by this Client's Process request. */
    public async launch(value: unknown = {}) {

        const launch = parseLaunch(value)

        if (typeof launch.client === "object") await this.clientLayer(launch.client)

        return launch
    }

    /** Authorize one fresh Client Endpoint incarnation in an existing Process. */
    public async clientLaunch(value: unknown = {}) {

        const launch = parseLaunch({ client: value }).client

        if (!launch || typeof launch !== "object") throw new Error("A Client launch must be an object")

        await this.clientLayer(launch)

        return launch
    }

    private async clientLayer(launch: ClientLaunch) {

        if (launch.layer !== undefined && launch.layer !== "window") await this.require("layers", [launch.layer])
    }

    public async requireNetwork(scope: string) {

        await this.require("network", [scope])
    }

    public async requireStorage(path: string, operation?: "read" | "write" | "delete") {

        if (!await this.authManager.grantsStorage(this.pane, path, operation)) throw new Error(denied)
    }

    public async require<Name extends PermissionName>(name: Name, values: readonly PermissionValue<Name>[]) {

        if (!await this.authManager.grantsPermission(this.pane, name, values)) throw new Error(denied)
    }

    private owner() {

        const process = this.authManager.processManager.processes.get(this.pane)

        if (!process) throw new Error("The desktop does not know this process")

        return process
    }
}
