import { parseLaunch, type ClientLaunch, type PermissionName, type PermissionValue } from "@phreshos/core"
import type Program from "../program-manager/program"
import type Process from "./process"
import type ProcessManager from "./process-manager"

const denied = "Execution is not permitted"

/** The permission-constrained System authority of one Server Endpoint. */
export default class SystemAccess {

    public constructor(private readonly manager: ProcessManager, private readonly owner: Process) { }

    public ownsProgram(program: Pick<Program, "identity">) { return this.owner.program.identity === program.identity }
    public ownsProcess(process: Pick<Process, "program">) { return this.owner.program === process.program }

    public all() { return this.manager.grants(this.owner.identity, "all", []) }

    public canProgram(program: Pick<Program, "identity">) {

        return this.ownsProgram(program) || this.manager.grants(this.owner.identity, "programs", [program.identity])
    }

    public canProcess(process: Pick<Process, "program">) {

        return this.ownsProcess(process) || this.manager.grants(this.owner.identity, "programs", [process.program.identity])
    }

    public canAuthentication() { return this.manager.grants(this.owner.identity, "authentication", []) }

    public program<Subject extends Program>(program: Subject) {

        if (!this.canProgram(program)) throw new Error("The Program represented by this handle does not exist")

        return program
    }

    public process<Subject extends Process>(process: Subject) {

        if (!this.canProcess(process)) throw new Error("The Process represented by this handle does not exist")

        return process
    }

    public requireAll() { if (!this.all()) throw new Error(denied) }

    public require<Name extends PermissionName>(name: Name, values: readonly PermissionValue<Name>[]) {

        if (!this.manager.grants(this.owner.identity, name, values)) throw new Error(denied)
    }

    public requireStorage(path: string, operation?: "read" | "write" | "delete") {

        if (!this.manager.grantsStorage(this.owner.identity, path, operation)) throw new Error(denied)
    }

    public launch(value: unknown = {}) {

        const launch = parseLaunch(value)

        if (typeof launch.client === "object") this.clientLayer(launch.client)

        return launch
    }

    public clientLaunch(value: unknown = {}) {

        const launch = parseLaunch({ client: value }).client

        if (!launch || typeof launch !== "object") throw new Error("A Client launch must be an object")

        this.clientLayer(launch)

        return launch
    }

    private clientLayer(launch: ClientLaunch) {

        if (launch.layer !== undefined && launch.layer !== "window") this.require("layers", [launch.layer])
    }
}
