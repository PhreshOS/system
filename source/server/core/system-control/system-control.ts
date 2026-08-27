import {
    systemControlInputIssue,
    systemControlOperation,
    type EndpointAskInput,
    type EndpointInput,
    type EndpointPublishInput,
    type EndpointWaitInput,
    type EndpointWaitReadyInput,
    type ProcessCreateInput,
    type ProcessFindOrCreateInput,
    type ProcessInput,
    type ProcessListInput,
    type ProcessWaitInput,
    type ProgramInput,
    type ProgramListInput,
    type ProgramWaitInput,
    type SystemControlRequest,
    type SystemControlOperation,
    type WindowInput,
    type WindowWaitInput
} from "@phreshos/core"
import { z } from "zod"
import type Application from "../application"
import type Entry from "../link-manager/auth-manager/program-manager/entry"
import type Process from "../link-manager/auth-manager/process-manager/process"

const envelope = z.object({
    capability: z.string(),
    operation: z.string(),
    input: z.unknown()
}).strict()

const inputs = new WeakMap<SystemControlOperation, z.ZodType>()

/** Executes the shared System-control contract against authoritative Core state. */
export default class SystemControl {

    public constructor(private readonly application: Application) {}

    public async execute(value: unknown, signal?: AbortSignal) {

        const request = envelope.parse(value)
        const operation = systemControlOperation(request.capability, request.operation)

        if (!operation) throw new Error(`Unknown System control operation "${request.capability}.${request.operation}"`)

        let validator = inputs.get(operation)

        if (!validator) {

            validator = z.fromJSONSchema(operation.input as Parameters<typeof z.fromJSONSchema>[0])
            inputs.set(operation, validator)
        }

        const input = validator.parse(request.input)
        const issue = systemControlInputIssue(request.capability, request.operation, input)

        if (issue) throw new Error(issue)

        const normalized = { capability: request.capability, operation: request.operation, input } as SystemControlRequest

        if (normalized.capability === "program") return this.program(normalized.operation, normalized.input, signal)
        if (normalized.capability === "process") return this.process(normalized.operation, normalized.input, signal)
        if (normalized.capability === "endpoint") return this.endpoint(normalized.operation, normalized.input, signal)
        return this.window(normalized.operation, normalized.input, signal)
    }

    private async program(operation: string, input: ProgramListInput | ProgramInput | ProgramWaitInput, signal?: AbortSignal) {

        const manager = this.programs

        if (operation === "list") {

            const request = input as ProgramListInput
            const installedOnly = request.installedOnly ?? true
            const query = request.search?.toLocaleLowerCase()
            const found = [...manager.programs.values()].filter(entry => (
                (!installedOnly || entry.installed)
                && (!query || [entry.identity, entry.program.name, entry.program.config.description]
                    .some(value => value?.toLocaleLowerCase().includes(query)))
            ))
            const selected = found
                .sort((left, right) => left.identity.localeCompare(right.identity))
                .slice(0, request.limit ?? 30)

            return Object.freeze({
                data: Object.freeze(selected.map(programSnapshot)),
                total: found.length,
                truncated: found.length > selected.length
            })
        }

        if (operation === "wait") return this.waitProgram(input as ProgramWaitInput, signal)

        const entry = requiredProgram(manager.programs, (input as ProgramInput).program)

        if (operation === "inspect") return programSnapshot(entry)

        const content = entry.program.agent()

        if (content === null) throw new Error(`Program "${entry.identity}" has no agent documentation`)

        return Object.freeze({ program: entry.identity, content })
    }

    private async process(operation: string, input: ProcessListInput | ProcessInput | ProcessCreateInput | ProcessFindOrCreateInput | ProcessWaitInput, signal?: AbortSignal) {

        if (operation === "list") {

            const request = input as ProcessListInput
            const owner = request.program ? requiredProgram(this.programs.programs, request.program).program : null
            const query = request.search?.toLocaleLowerCase()
            const found = [...this.processes.processes.values()].filter(process => (
                (!owner || process.program === owner)
                && (!query || [process.identity, process.name, process.program.identity]
                    .some(value => value?.toLocaleLowerCase().includes(query)))
            ))
            const selected = found
                .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime())
                .slice(0, request.limit ?? 30)

            return Object.freeze({
                data: Object.freeze(selected.map(processSnapshot)),
                total: found.length,
                truncated: found.length > selected.length
            })
        }

        if (operation === "wait") return this.waitProcess(input as ProcessWaitInput, signal)

        if (operation === "create" || operation === "findOrCreate") {

            const request = input as ProcessCreateInput | ProcessFindOrCreateInput
            const identity = operation === "create"
                ? await this.programs.createProcess(request.program, request.launch)
                : await this.programs.findOrCreateProcess(
                    request.program,
                    (request as ProcessFindOrCreateInput).launch
                )

            return processSnapshot(requiredProcess(this.processes.processes, identity))
        }

        const request = input as ProcessInput
        const process = resolveProcess(this.processes.processes, this.programs.programs, request)
        const snapshot = processSnapshot(process)

        if (operation === "exit") {

            await this.processes.exit(process.identity)

            return Object.freeze({ ...snapshot, exited: true })
        }

        return snapshot
    }

    private async endpoint(operation: string, input: EndpointInput | EndpointWaitReadyInput | EndpointAskInput | EndpointPublishInput | EndpointWaitInput, signal?: AbortSignal) {

        const process = resolveProcess(this.processes.processes, this.programs.programs, input)
        const declaration = process.program[input.endpoint]

        if (!declaration) throw new Error(`Program "${process.program.identity}" does not declare a ${input.endpoint} Endpoint`)

        if (operation === "inspect") return endpointSnapshot(process, input.endpoint)

        if (operation === "start" || operation === "stop") {

            if (operation === "start") {
                if (input.endpoint === "server") await this.processes.startServer(process.identity)
                else await this.processes.startClient(process.identity)
            } else {
                if (input.endpoint === "server") await this.processes.stopServer(process.identity)
                else await this.processes.stopClient(process.identity)
            }

            return endpointSnapshot(process, input.endpoint)
        }

        if (operation === "waitReady") {

            await waitReady(process, (input as EndpointWaitReadyInput).timeout, signal)

            return endpointSnapshot(process, "server")
        }

        if (operation === "ask") {

            const request = input as EndpointAskInput

            return this.processes.askFromOutside(
                process.identity,
                request.event,
                request.payload,
                request.timeout,
                signal
            )
        }

        if (operation === "publish") {

            const request = input as EndpointPublishInput

            await this.processes.publishFromOutside(process.identity, request.endpoint, request.event, request.payload)

            return Object.freeze({ ...endpointSnapshot(process, request.endpoint), event: request.event, published: true })
        }

        const request = input as EndpointWaitInput
        const payload = await waitFor(
            (resolve, reject) => this.processes.observeEndpoint(
                process.identity,
                request.endpoint,
                request.event,
                resolve,
                reason => reject(new Error(reason))
            ),
            request.timeout,
            signal
        )

        return Object.freeze({
            scope: "endpoint",
            process: process.identity,
            endpoint: request.endpoint,
            event: request.event,
            payload
        })
    }

    private async window(operation: string, input: WindowInput | WindowWaitInput | (WindowInput & Record<string, unknown>), signal?: AbortSignal) {

        const process = resolveProcess(this.processes.processes, this.programs.programs, input)
        const request = input as WindowInput & Record<string, unknown>

        if (!process.client) throw new Error(`Process "${process.identity}" has no running Client Endpoint`)

        if (operation === "wait") {

            const waiting = input as WindowWaitInput
            const payload = await waitFor(
                (resolve, reject) => {

                    const stopObservation = this.processes.observeHost("window", waiting.event, process.reference, (_event, _subject, value) => resolve(value))
                    const stopProcess = process.onExit(() => reject(new Error(`Process "${process.identity}" exited while waiting for its Window`)))
                    const stopClient = process.onClientStop(() => reject(new Error(`The Client Endpoint stopped while waiting for Process "${process.identity}" Window`)))

                    return () => { stopObservation(); stopProcess(); stopClient() }
                },
                waiting.timeout,
                signal
            )

            return Object.freeze({ scope: "window", process: process.identity, event: waiting.event, payload })
        }

        if (operation === "move") await this.processes.move(process.identity, request.position as never)
        else if (operation === "resize") await this.processes.resize(process.identity, request.size as never)
        else if (operation === "setGeometry") await this.processes.setGeometry(process.identity, {
            position: request.position as never,
            size: request.size as never
        })
        else if (operation === "minimize") await this.processes.minimize(process.identity, request.minimized !== false)
        else if (operation === "changeTitle") await this.processes.changeTitle(process.identity, String(request.title))
        else if (operation === "raise") await this.processes.raise(process.identity)

        return Object.freeze({ process: process.identity, ...this.processes.windowSnapshot(process.identity) })
    }

    private async waitProgram(request: ProgramWaitInput, signal?: AbortSignal) {

        const entry = request.program ? requiredProgram(this.programs.programs, request.program) : null
        const subject = entry?.program.reference ?? null
        const values = await waitFor<unknown[]>(
            resolve => this.processes.observeHost("program", request.event, subject, (_event, ...payload) => resolve(payload)),
            request.timeout,
            signal
        )

        const affected = entry ?? values.find(value => value && typeof value === "object" && "program" in value) as Entry | undefined
            ?? values.find(value => value && typeof value === "object" && "installed" in value) as Entry | undefined

        return Object.freeze({
            scope: entry ? "program" : "host",
            ...(entry ? { program: programSnapshot(entry) } : {}),
            event: request.event,
            payload: request.event === "uninstall"
                ? Object.freeze({
                    ...(affected ? { program: programSnapshot(affected) } : {}),
                    everythingRemoved: values.at(-1) === true
                })
                : affected ? programSnapshot(affected) : values
        })
    }

    private async waitProcess(request: ProcessWaitInput, signal?: AbortSignal) {

        const process = request.process
            ? resolveProcess(this.processes.processes, this.programs.programs, request as ProcessInput)
            : null
        const program = !process && request.program
            ? requiredProgram(this.programs.programs, request.program)
            : null
        const subject = process?.reference ?? program?.program.reference ?? null
        const values = await waitFor<unknown[]>(
            resolve => this.processes.observeHost("process", request.event, subject, (_event, ...payload) => resolve(payload)),
            request.timeout,
            signal
        )
        const record = values.find(value => value && typeof value === "object" && "identity" in value) as ReturnType<Process["record"]> | undefined

        return Object.freeze({
            scope: process ? "process" : program ? "program" : "host",
            ...(process ? { process: process.identity } : {}),
            ...(program ? { program: program.identity } : {}),
            event: request.event,
            payload: request.event === "exit"
                ? Object.freeze({
                    process: record?.identity ?? process?.identity ?? null,
                    status: values.at(-1) ? "signaled" : "exited",
                    code: values.at(-2) ?? null,
                    signal: values.at(-1) ?? null
                })
                : request.event === "endpointStart" || request.event === "endpointStop"
                    ? Object.freeze({ process: record?.identity ?? process?.identity ?? null, endpoint: values.at(-1) })
                    : record ? processRecordSnapshot(record) : values
        })
    }

    private get programs() { return this.application.linkManager.authManager.programManager }
    private get processes() { return this.application.linkManager.authManager.processManager }
}

function requiredProgram(programs: ReadonlyMap<string, Entry>, identity: string) {

    const program = programs.get(identity)

    if (!program) throw new Error(`Unknown Program "${identity}"`)

    return program
}

function requiredProcess(processes: ReadonlyMap<string, Process>, identity: string) {

    const process = processes.get(identity)

    if (!process) throw new Error(`Unknown Process "${identity}"`)

    return process
}

function resolveProcess(processes: ReadonlyMap<string, Process>, programs: ReadonlyMap<string, Entry>, input: ProcessInput) {

    if (!input.program) return requiredProcess(processes, input.process)

    const owner = requiredProgram(programs, input.program).program
    const process = [...processes.values()].find(candidate => (
        candidate.program === owner
        && (candidate.identity === input.process || candidate.name === input.process)
    ))

    if (!process) throw new Error(`Unknown Process "${input.process}" in Program "${input.program}"`)

    return process
}

function programSnapshot(entry: Entry) {

    const program = entry.program

    return Object.freeze({
        identity: program.identity,
        name: program.name,
        version: program.config.version ?? null,
        description: program.config.description ?? null,
        installed: entry.installed,
        hasAgent: program.agentPath !== null,
        server: program.server ? Object.freeze({ start: program.server.start }) : null,
        client: program.client ? Object.freeze({
            start: program.client.start,
            title: program.client.title ?? null,
            size: program.client.size ?? null,
            position: program.client.position ?? null,
            layer: program.client.layer ?? null,
            minimize: program.client.minimize ?? null
        }) : null
    })
}

function processSnapshot(process: Process) {

    return Object.freeze({
        identity: process.identity,
        name: process.name,
        program: process.program.identity,
        startedAt: process.startedAt.toISOString(),
        server: Object.freeze({ declared: process.program.server !== null, running: process.server !== null }),
        client: Object.freeze({ declared: process.program.client !== null, running: process.client !== null })
    })
}

function processRecordSnapshot(process: ReturnType<Process["record"]>) {

    const record = process as unknown as {
        identity: string
        name: string | null
        program: { identity: string, server: unknown, client: unknown }
        startedAt: Date | string
        server: unknown
        client: unknown
    }

    return Object.freeze({
        identity: record.identity,
        name: record.name,
        program: record.program.identity,
        startedAt: new Date(record.startedAt).toISOString(),
        server: Object.freeze({ declared: record.program.server !== null, running: record.server !== null }),
        client: Object.freeze({ declared: record.program.client !== null, running: record.client !== null })
    })
}

function endpointSnapshot(process: Process, endpoint: "server" | "client") {

    return Object.freeze({
        process: process.identity,
        program: process.program.identity,
        endpoint,
        declared: process.program[endpoint] !== null,
        running: process[endpoint] !== null
    })
}

function waitReady(process: Process, timeout = 10_000, signal?: AbortSignal) {

    return waitFor<void>((resolve, reject) => {

        const stopReady = process.waitReady(resolve)
        const stopExit = process.onExit(() => reject(new Error(`Process "${process.identity}" exited before its Server became ready`)))
        const stopServer = process.onServerStop(() => reject(new Error(`The Server Endpoint stopped before Process "${process.identity}" became ready`)))

        return () => { stopReady(); stopExit(); stopServer() }
    }, timeout, signal)
}

function waitFor<Value>(subscribe: (resolve: (value: Value) => void, reject: (error: Error) => void) => () => void, timeout = 10_000, signal?: AbortSignal) {

    return new Promise<Value>((resolve, reject) => {

        let done = false
        let cleanup: () => void = () => undefined
        const finish = (work: () => void) => {

            if (done) return

            done = true
            clearTimeout(timer)
            signal?.removeEventListener("abort", cancel)
            cleanup()
            work()
        }
        const cancel = () => finish(() => reject(signal?.reason instanceof Error ? signal.reason : new Error("The wait was cancelled")))
        const timer = setTimeout(() => finish(() => reject(new Error(`Event promise timeout ${timeout}ms`))), timeout)

        const subscribed = subscribe(
            value => finish(() => resolve(value)),
            error => finish(() => reject(error))
        )

        cleanup = subscribed

        if (done) cleanup()

        if (signal?.aborted) cancel()
        else signal?.addEventListener("abort", cancel, { once: true })
    })
}
