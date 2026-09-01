import type Application from "./application"
import type Entry from "./link-manager/auth-manager/program-manager/entry"
import type Program from "./link-manager/auth-manager/program-manager/program"
import type Process from "./link-manager/auth-manager/process-manager/process"
import type { ClientLaunch, Launch, PermissionName, Position, ServerLaunch, Size, WindowGeometry } from "@phreshos/core"
import type { Half, TrafficKind } from "./link-manager/auth-manager/process-manager/process-traffic"
import { processReference, type ProcessReference } from "./link-manager/auth-manager/process-manager/endpoint-reference"
import type { Area, Watching } from "./link-manager/auth-manager/program-manager/program-manager"

type Endpoint = "server" | "client"
type ProgramSource = Parameters<Application["linkManager"]["authManager"]["programManager"]["create"]>[0]

/**
 * The authoritative System domain shared by every trusted boundary.
 *
 * A transport may validate, authenticate, serialize, or stream an operation,
 * but it does not implement System behavior. Both the in-process Server
 * boundary and the owner Gateway resolve and mutate entities through here.
 */
export default class System {

    public constructor(private readonly application: Application) {}

    public listPrograms(onlyInstalled = false) {

        return [...this.programManager.programs.values()].filter(entry => !onlyInstalled || entry.installed)
    }

    public findProgram(identity: string) {

        return this.programManager.programs.get(identity) ?? null
    }

    public requireProgram(identity: string) {

        const entry = this.findProgram(identity)

        if (!entry) throw new Error(`Unknown Program "${identity}"`)

        return entry
    }

    /** Resolve an exact Program handle without retargeting a replacement. */
    public holdProgram(value: unknown, fallback?: Program) {

        if (value === undefined || value === null) {

            if (fallback) return fallback

            throw new Error("A Program handle is required")
        }

        if (!isHandleAddress(value)) throw new Error("The boundary returned an invalid Program handle")

        const program = this.programManager.reach(value.identity)

        if (!program || program.reference !== value.reference) throw new Error("The Program represented by this handle does not exist")

        return program
    }

    public async createProgram(source: ProgramSource) {

        return this.programManager.create(source)
    }

    public async forceCreateProgram(source: ProgramSource, asker: string | null = null) {

        return this.programManager.forceCreate(source, asker)
    }

    public forkProgram(program: Program, identity: string) {

        return this.programManager.fork(program, identity)
    }

    public programPermissions(program: Program) {

        return this.programManager.permissions(program)
    }

    public programPermission(program: Program, permission: PermissionName) {

        return this.programManager.permission(program, permission)
    }

    public setProgramPermission(program: Program, permission: PermissionName, value: boolean) {

        this.programManager.setPermission(program, permission, value)
    }

    public deleteProgramPermission(program: Program, permission: PermissionName) {

        this.programManager.deletePermission(program, permission)
    }

    public listProcesses(program?: Program) {

        return [...this.processManager.processes.values()].filter(process => !program || process.program === program)
    }

    public findProcess(identity: string, program?: Program) {

        const exact = this.processManager.processes.get(identity)

        if (!program) return exact ?? null
        if (exact?.program === program) return exact

        return this.listProcesses(program).find(process => process.name === identity) ?? null
    }

    public requireProcess(identity: string, program?: Program) {

        const process = this.findProcess(identity, program)

        if (!process) {

            const scope = program ? ` in Program "${program.identity}"` : ""

            throw new Error(`Unknown Process "${identity}"${scope}`)
        }

        return process
    }

    /** Resolve an exact Process handle without retargeting a replacement. */
    public holdProcess(value: unknown, fallback?: Process) {

        if (value === undefined || value === null) {

            if (fallback) return fallback

            throw new Error("A Process handle is required")
        }

        if (!isHandleAddress(value)) throw new Error("The boundary returned an invalid Process handle")

        const process = this.processManager.processes.get(value.identity)

        if (!process || process.reference !== value.reference) throw new Error("The Process represented by this handle does not exist")

        return process
    }

    public resolveProcess(input: { process: string, program?: string }) {

        const program = input.program ? this.requireProgram(input.program).program : undefined

        return this.requireProcess(input.process, program)
    }

    public async createProcess(program: string | Program, launch: Launch = {}, parent: Process | string | null = null) {

        return this.programManager.createProcess(typeof program === "string" ? program : program.identity, launch, parent)
    }

    public async findOrCreateProcess(program: string | Program, launch: Launch & { name: string }, parent: Process | string | null = null) {

        return this.programManager.findOrCreateProcess(program, launch, parent)
    }

    public runProcess(program: Program, launch: Launch = {}, watching?: Watching, parent: Process | null = null) {

        return this.programManager.runProcess(program, launch, watching, parent)
    }

    public exitProgramProcesses(program: Program, asker: string | null = null) {

        return this.processManager.exitAll(program.identity, asker)
    }

    public async exitProcess(process: Process) {

        return this.processManager.exit(process.identity)
    }

    public async startEndpoint(process: Process, endpoint: "server", launch?: ServerLaunch): Promise<void>
    public async startEndpoint(process: Process, endpoint: "client", launch?: ClientLaunch): Promise<void>
    public async startEndpoint(process: Process, endpoint: Endpoint, launch?: ServerLaunch | ClientLaunch) {

        if (endpoint === "server") await this.processManager.startServer(process.identity, launch as ServerLaunch)
        else await this.processManager.startClient(process.identity, launch as ClientLaunch)
    }

    public async stopEndpoint(process: Process, endpoint: Endpoint) {

        if (endpoint === "server") await this.processManager.stopServer(process.identity)
        else await this.processManager.stopClient(process.identity)
    }

    public endpointSnapshot(process: Process, endpoint: Endpoint) {

        return Object.freeze({
            process: process.identity,
            program: process.program.identity,
            endpoint,
            declared: process.program[endpoint] !== null,
            running: process[endpoint] !== null,
            service: process[endpoint]?.service ?? false
        })
    }

    public observe(domain: "program" | "process" | "window", event: string, subject: string | null, subscriber: (event: string, ...values: unknown[]) => void) {

        return this.processManager.observeHost(domain, event, subject, subscriber)
    }

    public observeEndpoint(process: Process, endpoint: Half, event: string | null, subscriber: (payload: unknown, event: string) => void, impossible?: (reason: string) => void) {

        return this.processManager.observeEndpoint(process.identity, endpoint, event, subscriber, impossible)
    }

    public observeTraffic(process: Process, endpoint: Half, kind: TrafficKind, event: string | null, subscriber: (event: string, ...values: unknown[]) => void, impossible?: (reason: string) => void) {

        return this.processManager.observeTrafficFromOutside(process.identity, endpoint, kind, event, subscriber, impossible)
    }

    public publishEndpoint(process: Process, endpoint: Half, event: string, payload: unknown) {

        return this.processManager.publishFromOutside(process.identity, endpoint, event, payload)
    }

    public askEndpoint(process: Process, event: string, payload: unknown, timeout = 10_000, signal?: AbortSignal) {

        return this.processManager.askFromOutside(process.identity, event, payload, timeout, signal)
    }

    public windowSnapshot(process: Process) {

        return this.processManager.windowSnapshot(process.identity)
    }

    public async moveWindow(process: Process, position: Position) {

        await this.processManager.move(process.identity, position)
    }

    public async resizeWindow(process: Process, size: Size) {

        await this.processManager.resize(process.identity, size)
    }

    public async setWindowGeometry(process: Process, geometry: WindowGeometry) {

        await this.processManager.setGeometry(process.identity, geometry)
    }

    public async minimizeWindow(process: Process, minimized: boolean) {

        await this.processManager.minimize(process.identity, minimized)
    }

    public async changeWindowTitle(process: Process, title: string) {

        await this.processManager.changeTitle(process.identity, title)
    }

    public async raiseWindow(process: Process) {

        await this.processManager.raise(process.identity)
    }

    public programSnapshot(entry: Entry) {

        const program = entry.program

        return Object.freeze({
            reference: program.reference,
            identity: program.identity,
            name: program.name,
            version: program.config.version ?? null,
            description: program.config.description ?? null,
            installed: entry.installed,
            hasAgent: program.agentPath !== null,
            server: program.server ? Object.freeze({ start: program.server.start, service: program.server.service }) : null,
            client: program.client ? Object.freeze({
                start: program.client.start,
                service: program.client.service,
                title: program.client.title ?? null,
                size: program.client.size ?? null,
                position: program.client.position ?? null,
                layer: program.client.layer ?? null,
                minimize: program.client.minimize ?? null
            }) : null
        })
    }

    public processSnapshot(process: Process) {

        return this.describeProcess(processReference(process), process.parent?.identity ?? null)
    }

    public processSnapshotFromReference(process: ProcessReference) {

        return this.describeProcess(process, null)
    }

    private describeProcess(process: ProcessReference, parent: string | null) {

        const owner = process.program

        return Object.freeze({
            reference: process.reference,
            identity: process.identity,
            name: process.name,
            program: owner.identity,
            programSnapshot: Object.freeze({
                reference: owner.reference,
                identity: owner.identity,
                name: owner.name,
                version: owner.version,
                description: owner.description,
                hasAgent: owner.hasAgent,
                server: owner.server,
                client: owner.client
            }),
            parent,
            options: Object.freeze({ ...process.options }),
            startedAt: process.startedAt.toISOString(),
            server: Object.freeze({ declared: owner.server !== null, running: process.server !== null, service: process.server?.service ?? false }),
            client: Object.freeze({ declared: owner.client !== null, running: process.client !== null, service: process.client?.service ?? false })
        })
    }

    public get appearance() {

        return this.application.appearanceManager.value
    }

    public updateAppearance(value: unknown) {

        return this.application.linkManager.updateAppearance(value)
    }

    public observeAppearance(subscriber: (value: unknown) => void) {

        return this.application.linkManager.appearance.tunnel.subscribe("change", subscriber)
    }

    public programIcon(program: Program, size: unknown) {

        return this.programManager.icon(program.identity, size)
    }

    public programAgent(program: Program) {

        return this.programManager.agent(program.identity)
    }

    public programStartup(program: Program, operation: string, value?: unknown) {

        return this.programManager.startup(program, operation, value)
    }

    public programInstalled(program: Program) {

        return this.programManager.installed(program)
    }

    public forgetProgram(program: Program, asker: string | null = null) {

        return this.programManager.forget(program, asker)
    }

    public installProgram(program: Program, asker: string | null = null) {

        return this.programManager.installStreaming(program, asker)
    }

    public uninstallProgram(program: Program, everything = false, asker: string | null = null) {

        return this.programManager.uninstallStreaming(program, everything, asker)
    }

    public programArea(program: Program, area: Area, operation: string, args: unknown[]) {

        return this.programManager.operate(program, area, operation, args)
    }

    public programStoragePath(program: Program, area: Area) {

        return this.programManager.area(program.identity, area, "path", [])
    }

    public programStore(program: Program, operation: string, key: string, value?: unknown, ttl?: number) {

        return this.programManager.store(program.identity, operation, key, value, ttl)
    }

    public programQuery(program: Program, database: "logs" | "database", statement: string, values: unknown[]) {

        return (database === "logs" ? this.programManager.logsOf(program) : this.programManager.databaseOf(program)).query(statement, values)
    }

    public endpointIsService(process: Process, endpoint: Half) {

        return this.processManager.endpointIsServiceFromOutside(process.identity, endpoint)
    }

    public serviceExists(key: unknown) {

        return this.processManager.serviceExistsFromOutside(key)
    }

    public waitServiceReady(key: unknown, timeout?: number) {

        return this.processManager.waitServiceReadyFromOutside(key, timeout)
    }

    public publishService(key: unknown, event: string, payload: unknown) {

        return this.processManager.publishServiceFromOutside(key, event, payload)
    }

    public askService(key: unknown, event: string, payload: unknown, timeout = 10_000, signal?: AbortSignal) {

        return this.processManager.askServiceFromOutside(key, event, payload, timeout, signal)
    }

    public observeService(key: unknown, scope: "lifecycle" | "events", event: string | null, subscriber: (event: string, payload: unknown) => unknown) {

        return this.processManager.observeServiceFromOutside(key, scope, event, subscriber)
    }

    public get uploads() {

        return this.application.uploads
    }

    public get storagePath() {

        return this.application.home.path
    }

    private get programManager() { return this.application.linkManager.authManager.programManager }
    private get processManager() { return this.application.linkManager.authManager.processManager }
}

function isHandleAddress(value: unknown): value is { identity: string, reference: string } {

    return typeof value === "object"
        && value !== null
        && typeof (value as Record<string, unknown>).identity === "string"
        && typeof (value as Record<string, unknown>).reference === "string"
}
