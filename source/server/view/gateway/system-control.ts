import {
    systemControlInputIssue,
    systemControlOperation,
    type EndpointAskInput,
    type EndpointInput,
    type EndpointWaitLifecycleInput,
    type EndpointPublishInput,
    type EndpointStartInput,
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
import type System from "@server/core/system"
import type Entry from "@server/core/link-manager/auth-manager/program-manager/entry"
import type Process from "@server/core/link-manager/auth-manager/process-manager/process"

const envelope = z.object({
    capability: z.string(),
    operation: z.string(),
    input: z.unknown()
}).strict()

const inputs = new WeakMap<SystemControlOperation, z.ZodType>()

/** Owner-Gateway adapter for the neutral serialized System operation contract. */
export default class SystemControl {

    public constructor(private readonly system: System) {}

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

        if (operation === "list") {

            const request = input as ProgramListInput
            const installedOnly = request.installedOnly ?? true
            const query = request.search?.toLocaleLowerCase()
            const found = this.system.listPrograms(installedOnly).filter(entry => (
                !query || [entry.identity, entry.program.name, entry.program.config.description]
                    .some(value => value?.toLocaleLowerCase().includes(query)))
            )
            const selected = found
                .sort((left, right) => left.identity.localeCompare(right.identity))
                .slice(request.offset ?? 0, (request.offset ?? 0) + (request.limit ?? 30))

            return Object.freeze({
                data: Object.freeze(selected.map(entry => this.system.programSnapshot(entry))),
                total: found.length,
                truncated: (request.offset ?? 0) + selected.length < found.length
            })
        }

        if (operation === "wait") return this.waitProgram(input as ProgramWaitInput, signal)

        const entry = this.system.requireProgram((input as ProgramInput).program)

        if (operation === "inspect") return this.system.programSnapshot(entry)

        const content = await this.system.programAgent(entry.program)

        if (content === null) throw new Error(`Program "${entry.identity}" has no agent documentation`)

        return Object.freeze({ program: entry.identity, content })
    }

    private async process(operation: string, input: ProcessListInput | ProcessInput | ProcessCreateInput | ProcessFindOrCreateInput | ProcessWaitInput, signal?: AbortSignal) {

        if (operation === "list") {

            const request = input as ProcessListInput
            const owner = request.program ? this.system.requireProgram(request.program).program : null
            const query = request.search?.toLocaleLowerCase()
            const found = this.system.listProcesses(owner ?? undefined).filter(process => (
                !query || [process.identity, process.name, process.program.identity]
                    .some(value => value?.toLocaleLowerCase().includes(query)))
            )
            const selected = found
                .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime())
                .slice(request.offset ?? 0, (request.offset ?? 0) + (request.limit ?? 30))

            return Object.freeze({
                data: Object.freeze(selected.map(process => this.system.processSnapshot(process))),
                total: found.length,
                truncated: (request.offset ?? 0) + selected.length < found.length
            })
        }

        if (operation === "wait") return this.waitProcess(input as ProcessWaitInput, signal)

        if (operation === "create" || operation === "findOrCreate") {

            const request = input as ProcessCreateInput | ProcessFindOrCreateInput
            const identity = operation === "create"
                ? await this.system.createProcess(request.program, request.launch)
                : await this.system.findOrCreateProcess(
                    request.program,
                    (request as ProcessFindOrCreateInput).launch
                )

            return this.system.processSnapshot(this.system.requireProcess(identity))
        }

        const request = input as ProcessInput
        const process = this.system.resolveProcess(request)
        const snapshot = this.system.processSnapshot(process)

        if (operation === "exit") {

            await this.system.exitProcess(process)

            return Object.freeze({ ...snapshot, exited: true })
        }

        return snapshot
    }

    private async endpoint(operation: string, input: EndpointInput | EndpointStartInput | EndpointWaitReadyInput | EndpointWaitLifecycleInput | EndpointAskInput | EndpointPublishInput | EndpointWaitInput, signal?: AbortSignal) {

        const process = this.system.resolveProcess(input)
        const declaration = process.program[input.endpoint]

        if (!declaration) throw new Error(`Program "${process.program.identity}" does not declare a ${input.endpoint} Endpoint`)

        if (operation === "inspect") return this.system.endpointSnapshot(process, input.endpoint)

        if (operation === "start" || operation === "stop") {

            if (operation === "start") {

                const request = input as EndpointStartInput

                if (request.endpoint === "server") await this.system.startEndpoint(process, "server", request.launch)
                else await this.system.startEndpoint(process, "client", request.launch)
            } else {
                await this.system.stopEndpoint(process, input.endpoint)
            }

            return this.system.endpointSnapshot(process, input.endpoint)
        }

        if (operation === "waitReady") {

            await waitReady(process, (input as EndpointWaitReadyInput).timeout, signal)

            return this.system.endpointSnapshot(process, "server")
        }

        if (operation === "waitLifecycle") {

            const request = input as EndpointWaitLifecycleInput
            const internalEvent = request.event === "start" ? "endpointStart" : "endpointStop"

            await waitFor<void>(resolve => this.system.observe(
                "process",
                internalEvent,
                process.reference,
                (_event, _record, endpoint) => { if (endpoint === request.endpoint) resolve() }
            ), request.timeout, signal)

            return Object.freeze({
                scope: "endpoint.lifecycle",
                process: process.identity,
                endpoint: request.endpoint,
                event: request.event,
                payload: undefined
            })
        }

        if (operation === "ask") {

            const request = input as EndpointAskInput

            return this.system.askEndpoint(
                process,
                request.event,
                request.payload,
                request.timeout,
                signal
            )
        }

        if (operation === "publish") {

            const request = input as EndpointPublishInput

            await this.system.publishEndpoint(process, request.endpoint, request.event, request.payload)

            return Object.freeze({ ...this.system.endpointSnapshot(process, request.endpoint), event: request.event, published: true })
        }

        const request = input as EndpointWaitInput
        const payload = await waitFor(
            (resolve, reject) => this.system.observeEndpoint(
                process,
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

        const process = this.system.resolveProcess(input)
        const request = input as WindowInput & Record<string, unknown>

        if (!process.client) throw new Error(`Process "${process.identity}" has no running Client Endpoint`)

        if (operation === "wait") {

            const waiting = input as WindowWaitInput
            const payload = await waitFor(
                (resolve, reject) => {

                    const stopObservation = this.system.observe("window", waiting.event, process.reference, (_event, _subject, value) => resolve(value))
                    const stopProcess = process.onExit(() => reject(new Error(`Process "${process.identity}" exited while waiting for its Window`)))
                    const stopClient = process.onClientStop(() => reject(new Error(`The Client Endpoint stopped while waiting for Process "${process.identity}" Window`)))

                    return () => { stopObservation(); stopProcess(); stopClient() }
                },
                waiting.timeout,
                signal
            )

            return Object.freeze({ scope: "window", process: process.identity, event: waiting.event, payload })
        }

        if (operation === "move") await this.system.moveWindow(process, request.position as never)
        else if (operation === "resize") await this.system.resizeWindow(process, request.size as never)
        else if (operation === "setGeometry") await this.system.setWindowGeometry(process, {
            position: request.position as never,
            size: request.size as never
        })
        else if (operation === "minimize") await this.system.minimizeWindow(process, request.minimized !== false)
        else if (operation === "changeTitle") await this.system.changeWindowTitle(process, String(request.title))
        else if (operation === "raise") await this.system.raiseWindow(process)

        return Object.freeze({ process: process.identity, ...this.system.windowSnapshot(process) })
    }

    private async waitProgram(request: ProgramWaitInput, signal?: AbortSignal) {

        const entry = request.program ? this.system.requireProgram(request.program) : null
        const subject = entry?.program.reference ?? null
        const values = await waitFor<unknown[]>(
            resolve => this.system.observe("program", request.event, subject, (_event, ...payload) => resolve(payload)),
            request.timeout,
            signal
        )

        const affected = entry ?? values.find(value => value && typeof value === "object" && "program" in value) as Entry | undefined
            ?? values.find(value => value && typeof value === "object" && "installed" in value) as Entry | undefined

        return Object.freeze({
            scope: entry ? "program" : "host",
            ...(entry ? { program: this.system.programSnapshot(entry) } : {}),
            event: request.event,
            payload: request.event === "uninstall"
                ? Object.freeze({
                    ...(affected ? { program: this.system.programSnapshot(affected) } : {}),
                    everything: values.at(-1) === true
                })
                : affected ? this.system.programSnapshot(affected) : values
        })
    }

    private async waitProcess(request: ProcessWaitInput, signal?: AbortSignal) {

        const process = request.process
            ? this.system.resolveProcess(request as ProcessInput)
            : null
        const program = !process && request.program
            ? this.system.requireProgram(request.program)
            : null
        const subject = process?.reference ?? program?.program.reference ?? null
        const values = await waitFor<unknown[]>(
            resolve => this.system.observe("process", request.event, subject, (_event, ...payload) => resolve(payload)),
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
                    ...(record ? { processSnapshot: processRecordSnapshot(record) } : {}),
                    status: values.at(-1) ? "signaled" : "exited",
                    code: values.at(-2) ?? null,
                    signal: values.at(-1) ?? null
                })
                : record ? processRecordSnapshot(record) : values
        })
    }

}

function processRecordSnapshot(process: ReturnType<Process["record"]>) {

    const record = process as unknown as {
        identity: string
        name: string | null
        program: {
            reference: string
            identity: string
            name: string
            version: string | null
            description: string | null
            hasAgent: boolean
            server: unknown
            client: unknown
        }
        startedAt: Date | string
        server: { service: boolean } | null
        client: { service: boolean } | null
    }

    return Object.freeze({
        reference: process.reference,
        identity: record.identity,
        name: record.name,
        program: record.program.identity,
        programSnapshot: Object.freeze({
            reference: record.program.reference,
            identity: record.program.identity,
            name: record.program.name,
            version: record.program.version,
            description: record.program.description,
            hasAgent: record.program.hasAgent,
            server: record.program.server,
            client: record.program.client
        }),
        parent: null,
        options: Object.freeze({ ...process.options }),
        startedAt: new Date(record.startedAt).toISOString(),
        server: Object.freeze({ declared: record.program.server !== null, running: record.server !== null, service: record.server?.service ?? false }),
        client: Object.freeze({ declared: record.program.client !== null, running: record.client !== null, service: record.client?.service ?? false })
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
