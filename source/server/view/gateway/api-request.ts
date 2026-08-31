import type Application from "@server/core/application"
import { uploadLimit } from "@server/core/upload-manager"

/** Execute one operation belonging to the shared System SDK contract. */
export default async function apiRequest(application: Application, value: unknown, signal: AbortSignal) {

    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The System API request must be an object")

    const request = value as Record<string, unknown>

    if (request.capability === "appearance") {

        if (request.operation === "snapshot") return application.appearanceManager.value
        if (request.operation === "update") return await application.linkManager.updateAppearance(request.value)
        if (request.operation === "wait") return await waitForAppearance(application, signal)

        throw new Error(`The Appearance API does not know "${String(request.operation)}"`)
    }

    if (request.capability === "uploads") {

        if (request.operation === "access") return { path: application.uploads.fileManager.path, limit: uploadLimit }
        if (request.operation === "stat") return application.uploads.stat(String(request.file))

        throw new Error(`The Uploads API does not know "${String(request.operation)}"`)
    }

    if (request.capability === "endpoint" && request.operation === "isService") {

        if (typeof request.process !== "string" || request.endpoint !== "server" && request.endpoint !== "client") {

            throw new Error("Reading an Endpoint service role needs a Process and Endpoint")
        }

        return processes(application).endpointIsServiceFromOutside(request.process, request.endpoint)
    }

    if (request.capability === "endpoint" && request.operation === "wait") {

        if (typeof request.process !== "string" || request.endpoint !== "server" && request.endpoint !== "client") {

            throw new Error("Waiting for an Endpoint needs a Process and Endpoint")
        }
        if (request.event !== null && typeof request.event !== "string") throw new Error("An Endpoint event must be text or null")

        return await waitForEndpoint(processes(application), request.process, request.endpoint, request.event, timed(signal, request.timeout))
    }

    if (request.capability === "service") {

        const manager = processes(application)
        const key = request.key

        if (request.operation === "exists") return manager.serviceExistsFromOutside(key)
        if (request.operation === "waitReady") return await manager.waitServiceReadyFromOutside(key, number(request.timeout))

        if (request.operation === "publish" || request.operation === "ask") {
            if (typeof request.event !== "string") throw new Error("A Service event must be text")
            if (request.operation === "publish") return await manager.publishServiceFromOutside(key, request.event, request.payload)
            return await manager.askServiceFromOutside(key, request.event, request.payload, number(request.timeout) ?? 10_000, signal)
        }
        if (request.operation === "wait") {
            if (request.event !== null && typeof request.event !== "string") throw new Error("A Service event must be text or null")
            return await waitForService(manager, key, String(request.scope), request.event, timed(signal, request.timeout))
        }

        throw new Error(`The Service API does not know "${String(request.operation)}"`)
    }

    throw new Error(`Unknown System API capability "${String(request.capability)}"`)
}

function processes(application: Application) {

    return application.linkManager.authManager.processManager
}

function number(value: unknown) {

    if (value === undefined) return undefined
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("A timeout must be a non-negative finite number")
    return value
}

function waitForService(manager: ReturnType<typeof processes>, key: unknown, scope: string, event: string | null, signal: AbortSignal) {

    if (scope !== "lifecycle" && scope !== "events") throw new Error("A Service wait scope must be lifecycle or events")

    return new Promise((resolve, reject) => {

        const stop = manager.observeServiceFromOutside(key, scope, event, (received, payload) => {

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

function waitForEndpoint(manager: ReturnType<typeof processes>, process: string, endpoint: "server" | "client", event: string | null, signal: AbortSignal) {

    return new Promise((resolve, reject) => {

        const stop = manager.observeEndpoint(process, endpoint, event, (payload, received) => {

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

function waitForAppearance(application: Application, signal: AbortSignal) {

    return new Promise((resolve, reject) => {

        const stop = application.linkManager.appearance.tunnel.subscribe("change", (value: unknown) => {

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
