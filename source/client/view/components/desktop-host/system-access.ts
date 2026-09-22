import type AuthManager from "@client/core/link-manager/auth-manager/auth-manager"
import type Program from "@client/core/link-manager/auth-manager/program-manager/program"
import type Process from "@client/core/link-manager/auth-manager/process-manager/process"
import { parseLaunch, type ClientLaunch, type ConnectionSnapshot, type PermissionName, type PermissionValue, type ServiceAddress } from "@phreshos/core"
import { allowsSynchronizedPermission } from "@shared/permission-state"

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

    public async all() {

        return allowsSynchronizedPermission(this.permissions(), "all", [])
    }

    public async canProgram(program: Pick<Program, "identity">) {

        return this.ownsProgram(program)
            || allowsSynchronizedPermission(this.permissions(), "programs", [program.identity])
    }

    public async canProcess(process: Pick<Process, "program">) {

        return this.ownsProcess(process)
            || allowsSynchronizedPermission(this.permissions(), "programs", [process.program])
    }

    public async canService(service: ServiceAddress) {

        return allowsSynchronizedPermission(this.permissions(), "services", [service.process])
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

    public async service(service: ServiceAddress) {

        if (!await this.canService(service)) throw new Error("Execution is not permitted")

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

    /** Authorize one fresh Client Endpoint execution context in an existing Process. */
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

        if (!allowsSynchronizedPermission(this.permissions(), name, values)) throw new Error(denied)
    }

    private async currentConnection(): Promise<ConnectionSnapshot> {

        return await this.authManager.connection("current") as ConnectionSnapshot
    }

    private async connectionScope(): Promise<"all" | ConnectionSnapshot | null> {

        if (allowsSynchronizedPermission(this.permissions(), "connections", [])) return "all"
        if (!allowsSynchronizedPermission(this.permissions(), "desktopConnection", [])) return null

        return await this.currentConnection()
    }

    private owner() {

        const process = this.authManager.processManager.processes.get(this.pane)

        if (!process) throw new Error("The desktop does not know this process")

        return process
    }

    private permissions() {

        const program = this.authManager.programManager.programs.get(this.owner().program)

        if (!program) throw new Error("The desktop does not know this program")

        return program.permissions
    }
}
