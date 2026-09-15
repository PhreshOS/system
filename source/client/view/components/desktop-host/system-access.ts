import type AuthManager from "@client/core/link-manager/auth-manager/auth-manager"
import type Program from "@client/core/link-manager/auth-manager/program-manager/program"
import type Process from "@client/core/link-manager/auth-manager/process-manager/process"
import { parseLaunch, type ClientLaunch, type ConnectionSnapshot, type PermissionName, type PermissionValue, type ServiceKey } from "@phreshos/core"

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

    /** Whether one Connection belongs to this Client's visible scope. */
    public async canConnection(identity: string) {

        const scope = await this.connectionScope()

        return scope === "all" || scope?.identity === identity
    }

    /** Whether one Session belongs to this Client's visible scope. */
    public async canSession(identity: string) {

        const scope = await this.connectionScope()

        return scope === "all" || scope?.session === identity
    }

    /** Filters one Connection collection through a single authority snapshot. */
    public async connections<Connection extends { identity: string }>(connections: readonly Connection[]) {

        const scope = await this.connectionScope()

        if (scope === "all") return [...connections]
        if (scope === null) return []

        return connections.filter(connection => connection.identity === scope.identity)
    }

    /** Filters one Session collection through a single authority snapshot. */
    public async sessions<Session extends { identity: string }>(sessions: readonly Session[]) {

        const scope = await this.connectionScope()

        if (scope === "all") return [...sessions]
        if (scope === null || scope.session === null) return []

        return sessions.filter(session => session.identity === scope.session)
    }

    public async program(program: Program) {

        if (!await this.canProgram(program)) throw new Error("The Program represented by this handle does not exist")

        return program
    }

    public async process<Subject extends Pick<Process, "program">>(process: Subject) {

        if (!await this.canProcess(process)) throw new Error("The Process represented by this handle does not exist")

        return process
    }

    public async service(service: ServiceKey) {

        if (!await this.canService(service)) throw new Error("The Service represented by this key does not exist")

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

    private async currentConnection(): Promise<ConnectionSnapshot> {

        return await this.authManager.connection("current") as ConnectionSnapshot
    }

    private async connectionScope(): Promise<"all" | ConnectionSnapshot | null> {

        if (await this.authManager.grantsPermission(this.pane, "connections", [])) return "all"
        if (!await this.authManager.grantsPermission(this.pane, "desktopConnection", [])) return null

        return await this.currentConnection()
    }

    private owner() {

        const process = this.authManager.processManager.processes.get(this.pane)

        if (!process) throw new Error("The desktop does not know this process")

        return process
    }
}
