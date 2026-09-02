import type Application from "@server/core/application"
import { uploadLimit } from "@server/core/upload-manager"

/** Execute one operation belonging to the shared System SDK contract. */
export default async function apiRequest(application: Application, value: unknown, signal: AbortSignal) {

    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The System API request must be an object")

    const request = value as Record<string, unknown>
    const system = application.system

    if (request.capability === "appearance") {

        if (request.operation === "snapshot") return system.appearance
        if (request.operation === "update") return await system.updateAppearance(request.value)
        if (request.operation === "wait") return await waitForAppearance(system, signal)

        throw new Error(`The Appearance API does not know "${String(request.operation)}"`)
    }

    if (request.capability === "uploads") {

        if (request.operation === "access") return { path: system.uploads.fileManager.path, limit: uploadLimit }
        if (request.operation === "stat") return system.uploads.stat(String(request.file))

        throw new Error(`The Uploads API does not know "${String(request.operation)}"`)
    }

    if (request.capability === "program") {

        const program = system.holdProgram(request.handle)

        if (request.operation === "storagePath") {

            if (request.area !== "data" && request.area !== "cache") throw new Error("A Program storage area is data or cache")
            return system.programStoragePath(program, request.area)
        }

        if (request.operation === "icon") {

            if (request.size !== "small" && request.size !== "medium" && request.size !== "large") throw new Error("A Program icon size is small, medium, or large")
            return Array.from(await system.programIcon(program, request.size))
        }

        if (request.operation === "agent") return system.programAgent(program)

        if (request.operation === "permissions") {

            if (request.permissionOperation === "all") return system.programPermissions(program)
            if (request.permissionOperation === "get") return system.programPermission(program, String(request.name))
            if (request.permissionOperation === "set") return system.setProgramPermission(program, String(request.name), request.permission as never)
            if (request.permissionOperation === "delete") return system.deleteProgramPermission(program, String(request.name))

            throw new Error(`The Program permissions API does not know "${String(request.permissionOperation)}"`)
        }

        if (request.operation === "store") {

            if (typeof request.storeOperation !== "string") throw new Error("A Program store operation is required")
            return await system.programStore(program, request.storeOperation, request.key as string, request.value, number(request.ttl))
        }

        if (request.operation === "query") {

            if (request.database !== "logs" && request.database !== "database") throw new Error("A Program query targets logs or database")
            if (typeof request.statement !== "string" || !Array.isArray(request.values)) throw new Error("A Program query needs a statement and values")
            return system.programQuery(program, request.database, request.statement, request.values)
        }

        if (request.operation === "wait") {

            if (request.event !== "forget" && request.event !== "uninstall") throw new Error("A Program event is forget or uninstall")

            const values = await waitForHost(system, "program", request.event, program.reference, timed(signal, request.timeout))

            return request.event === "uninstall" ? values[0] === true : undefined
        }

        throw new Error(`The Program API does not know "${String(request.operation)}"`)
    }

    if (request.capability === "programProcess") {

        const program = system.holdProgram(request.handle)

        if (request.operation === "list") return system.listProcesses(program).map(process => system.processSnapshot(process))

        if (request.operation === "wait") {

            if (request.event !== "create" && request.event !== "exit") throw new Error("A Program Process event is create or exit")

            const values = await waitForHost(system, "process", request.event, program.reference, timed(signal, request.timeout))
            const process = system.processSnapshotFromReference(values[0] as Parameters<typeof system.processSnapshotFromReference>[0])

            if (request.event === "create") return process

            const namedSignal = typeof values[2] === "string" ? values[2] : null

            return Object.freeze({
                process,
                status: namedSignal === null ? "exited" : "signaled",
                code: typeof values[1] === "number" ? values[1] : null,
                signal: namedSignal
            })
        }

        throw new Error(`The Program Process API does not know "${String(request.operation)}"`)
    }

    if (request.capability === "endpoint" && request.operation === "isService") {

        if (typeof request.process !== "string" || request.endpoint !== "server" && request.endpoint !== "client") {

            throw new Error("Reading an Endpoint service role needs a Process and Endpoint")
        }

        return system.endpointIsService(system.requireProcess(request.process), request.endpoint)
    }

    if (request.capability === "endpoint" && request.operation === "wait") {

        if (typeof request.process !== "string" || request.endpoint !== "server" && request.endpoint !== "client") {

            throw new Error("Waiting for an Endpoint needs a Process and Endpoint")
        }
        if (request.event !== null && typeof request.event !== "string") throw new Error("An Endpoint event must be text or null")

        return await waitForEndpoint(system, system.requireProcess(request.process), request.endpoint, request.event, timed(signal, request.timeout))
    }

    if (request.capability === "traffic" && request.operation === "wait") {

        if (typeof request.process !== "string" || request.endpoint !== "server" && request.endpoint !== "client") {

            throw new Error("Waiting for Endpoint traffic needs a Process and Endpoint")
        }
        if (request.kind !== "publish" && request.kind !== "ask" && request.kind !== "answer") throw new Error("Endpoint traffic is publish, ask, or answer")
        if (request.kind === "answer" && request.endpoint !== "server") throw new Error("Only Server traffic contains answers")
        if (request.event !== null && typeof request.event !== "string") throw new Error("A traffic event must be text or null")

        return await waitForTraffic(
            system,
            system.requireProcess(request.process),
            request.endpoint,
            request.kind,
            request.event,
            timed(signal, request.timeout)
        )
    }

    if (request.capability === "service") {

        const key = request.key

        if (request.operation === "exists") return system.serviceExists(key)
        if (request.operation === "waitReady") return await system.waitServiceReady(key, number(request.timeout))

        if (request.operation === "publish" || request.operation === "ask") {

            if (typeof request.event !== "string") throw new Error("A Service event must be text")
            if (request.operation === "publish") return await system.publishService(key, request.event, request.payload)
            return await system.askService(key, request.event, request.payload, number(request.timeout) ?? 10_000, signal)
        }
        if (request.operation === "wait") {

            if (request.event !== null && typeof request.event !== "string") throw new Error("A Service event must be text or null")
            return await waitForService(system, key, String(request.scope), request.event, timed(signal, request.timeout))
        }

        throw new Error(`The Service API does not know "${String(request.operation)}"`)
    }

    throw new Error(`Unknown System API capability "${String(request.capability)}"`)
}

function number(value: unknown) {

    if (value === undefined) return undefined
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("A timeout must be a non-negative finite number")
    return value
}

function waitForService(system: Application["system"], key: unknown, scope: string, event: string | null, signal: AbortSignal) {

    if (scope !== "lifecycle" && scope !== "events") throw new Error("A Service wait scope must be lifecycle or events")

    return new Promise((resolve, reject) => {

        const stop = system.observeService(key, scope, event, (received, payload) => {

            cleanup()
            resolve(event === null ? { event: received, payload } : payload)
        })
        const abort = () => {

            cleanup()
            reject(signal.reason instanceof Error ? signal.reason : new Error("The Service wait was cancelled"))
        }
        const cleanup = () => {

            stop()
            signal.removeEventListener("abort", abort)
        }

        if (signal.aborted) abort()
        else signal.addEventListener("abort", abort, { once: true })
    })
}

function timed(signal: AbortSignal, value: unknown) {

    return AbortSignal.any([signal, AbortSignal.timeout(number(value) ?? 10_000)])
}

function waitForHost(
    system: Application["system"],
    domain: "program" | "process",
    event: string,
    subject: string,
    signal: AbortSignal
) {

    return new Promise<unknown[]>((resolve, reject) => {

        const stop = system.observe(domain, event, subject, (_event, ...values) => {

            cleanup()
            resolve(values)
        })
        const abort = () => {

            cleanup()
            reject(signal.reason instanceof Error ? signal.reason : new Error("The System wait was cancelled"))
        }
        const cleanup = () => {

            stop()
            signal.removeEventListener("abort", abort)
        }

        if (signal.aborted) abort()
        else signal.addEventListener("abort", abort, { once: true })
    })
}

function waitForEndpoint(system: Application["system"], process: Parameters<Application["system"]["observeEndpoint"]>[0], endpoint: "server" | "client", event: string | null, signal: AbortSignal) {

    return new Promise((resolve, reject) => {

        const stop = system.observeEndpoint(process, endpoint, event, (payload, received) => {

            cleanup()
            resolve({ event: received, payload })
        }, reason => {

            cleanup()
            reject(new Error(reason))
        })
        const abort = () => {

            cleanup()
            reject(signal.reason instanceof Error ? signal.reason : new Error("The Endpoint wait was cancelled"))
        }
        const cleanup = () => {

            stop()
            signal.removeEventListener("abort", abort)
        }

        if (signal.aborted) abort()
        else signal.addEventListener("abort", abort, { once: true })
    })
}

function waitForTraffic(
    system: Application["system"],
    process: Parameters<Application["system"]["observeTraffic"]>[0],
    endpoint: "server" | "client",
    kind: "publish" | "ask" | "answer",
    event: string | null,
    signal: AbortSignal
) {

    return new Promise((resolve, reject) => {

        const stop = system.observeTraffic(process, endpoint, kind, event, (received, ...values) => {

            cleanup()
            resolve({ event: received, values })
        }, reason => {

            cleanup()
            reject(new Error(reason))
        })
        const abort = () => {

            cleanup()
            reject(signal.reason instanceof Error ? signal.reason : new Error("The traffic wait was cancelled"))
        }
        const cleanup = () => {

            stop()
            signal.removeEventListener("abort", abort)
        }

        if (signal.aborted) abort()
        else signal.addEventListener("abort", abort, { once: true })
    })
}

function waitForAppearance(system: Application["system"], signal: AbortSignal) {

    return new Promise((resolve, reject) => {

        const stop = system.observeAppearance((value: unknown) => {

            cleanup()
            resolve(value)
        })
        const abort = () => {

            cleanup()
            reject(signal.reason instanceof Error ? signal.reason : new Error("The Appearance wait was cancelled"))
        }
        const cleanup = () => {

            stop()
            signal.removeEventListener("abort", abort)
        }

        if (signal.aborted) abort()
        else signal.addEventListener("abort", abort, { once: true })
    })
}
