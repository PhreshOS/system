import { parseLaunch, type PermissionName, type PermissionValue } from "@phreshos/core"
import type Program from "../program-manager/program"
import type Process from "./process"

/** What of a resolved Launch needs a permission: where its Client opens, and the Service names its Endpoints take. */
export type LaunchReach = Readonly<{
    server?: Readonly<{ service: string | false }> | null
    client: Readonly<{ layer?: string, service?: string | false }> | null
}>
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

    /**
     * A Launch as it will run for a Program: what it passes, and what the Program declares where it
     * passes nothing. Whoever executes it must be able to do all of it, whatever the Program declares.
     */
    public launch(program: Program, value: unknown = {}) {

        const launch = parseLaunch(value)

        this.requireLaunch(this.manager.authManager.programManager.resolveLaunch(program, launch).intent)

        return launch
    }

    /** A Server started for a running Process of this Program, as it will run. */
    public serverLaunch(program: Program, value: unknown = {}) {

        const launch = parseLaunch({ server: value }).server

        if (!launch || typeof launch !== "object") throw new Error("A Server launch must be an object")

        this.requireLaunch(this.manager.authManager.programManager.resolveLaunch(program, { server: launch, client: false }).intent)

        return launch
    }

    /** A Client started for a running Process of this Program, as it will run. */
    public clientLaunch(program: Program, value: unknown = {}) {

        const launch = parseLaunch({ client: value }).client

        if (!launch || typeof launch !== "object") throw new Error("A Client launch must be an object")

        this.requireLaunch(this.manager.authManager.programManager.resolveLaunch(program, { server: false, client: launch }).intent)

        return launch
    }

    /**
     * What a resolved Launch does that needs a permission: a Client in a layer other than `window`, and
     * each Service name its Endpoints take, taking it from whoever holds it.
     */
    public requireLaunch(launch: LaunchReach) {

        const layer = launch.client?.layer

        if (layer !== undefined && layer !== "window") this.require("layers", [layer as PermissionValue<"layers">])

        for (const service of [launch.server?.service, launch.client?.service]) {

            if (typeof service === "string") this.require("provideServices", [service])
        }
    }
}
