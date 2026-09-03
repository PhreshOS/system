import assert from "node:assert/strict"
import { TheLink } from "@the-link/core"
import type AuthManager from "@server/core/link-manager/auth-manager/auth-manager"
import Program from "@server/core/link-manager/auth-manager/program-manager/program"
import ProcessManager from "@server/core/link-manager/auth-manager/process-manager/process-manager"
import type Process from "@server/core/link-manager/auth-manager/process-manager/process"
import type ServerProcessBoundary from "@server/core/link-manager/auth-manager/process-manager/server-process-boundary"
import type { ServerRuntime } from "@server/core/server-runtime"

const launch = { server: null, client: null, options: {} } as const

function processManager() {

    const authManager = new TheLink() as unknown as AuthManager
    const manager = new ProcessManager(authManager)

    Object.assign(authManager, {
        programManager: {
            permission() { return null }
        },
        linkManager: {
            application: {
                system: {
                    holdProcess(value: unknown, fallback?: Process) {

                        if (value === undefined || value === null) return fallback
                        if (typeof value !== "object" || value === null) throw new Error("Invalid Process handle")

                        const handle = value as { identity?: string, reference?: string }
                        const process = handle.identity ? manager.processes.get(handle.identity) : null

                        if (!process || process.reference !== handle.reference) throw new Error("The Process represented by this handle does not exist")

                        return process
                    }
                }
            }
        }
    })

    return manager
}

function program(identity: string) {

    return new Program({ identity, server: { location: ".", startCommand: "true" } })
}

async function register(manager: ProcessManager, identity: string) {

    return await manager.register(identity, null, program(identity), {}, launch, null, false, null, null)
}

// A failed configuration cannot leave either its Process identity or an
// unattached runtime behind in the registry.
{
    const manager = processManager()
    let stops = 0
    const runtime = { stop() { stops++ } } as unknown as ServerRuntime

    await assert.rejects(manager.register(
        "failed-registration",
        null,
        program("failed-registration"),
        {},
        launch,
        runtime,
        false,
        null,
        null,
        () => { throw new Error("configuration failed") }
    ), /configuration failed/)

    assert.equal(manager.processes.has("failed-registration"), false)
    assert.equal(stops, 1)
}

// Failure after an endpoint has been activated still retracts the partially
// announced Process and its client state.
{
    const manager = processManager()
    const client = new Program({ identity: "partial-registration", client: { location: "https://example.test/" } })

    manager.$outbound.subscribe("/created", () => {

        throw new Error("creation publication failed")
    })

    await assert.rejects(manager.register(
        "partial-registration",
        null,
        client,
        {},
        { ...launch, client: { title: "Partial", position: null, size: null, layer: "window", location: "/", minimize: false, service: false } },
        null,
        true,
        { title: "Partial", position: { x: 0, y: 0 }, size: { width: 320, height: 240 }, layer: "window", location: "/", minimize: false },
        null
    ), /creation publication failed/)

    assert.equal(manager.processes.has("partial-registration"), false)
}

// A failing observer is not allowed to stop the authoritative teardown or
// prevent later terminal publications from running.
{
    const manager = processManager()
    await register(manager, "teardown")
    let exited = false

    manager.$outbound.subscribe("/exited", () => { exited = true })

    const stop = manager.observeHost("process", "exit", null, () => {

        throw new Error("exit observer failed")
    })

    await assert.rejects(manager.remove("teardown"), /exit observer failed/)

    stop()

    assert.equal(manager.processes.has("teardown"), false)
    assert.equal(exited, true)
}

interface BoundaryProbe {

    boundary: ServerProcessBoundary

    deliveries: unknown[][]

    cancel(question: string): void
}

function boundaryProbe(): BoundaryProbe {

    const deliveries: unknown[][] = []
    const requests = new Map<string, () => void>()

    const boundary = {
        retain(question: string, cancel: () => void) {

            requests.get(question)?.()

            requests.set(question, cancel)
        },
        async deliver(event: string, ...values: unknown[]) {

            if (values[0] === "answer" && typeof values[1] === "string") requests.delete(values[1])

            deliveries.push([event, ...values])
        }
    } as unknown as ServerProcessBoundary

    return {
        boundary,
        deliveries,
        cancel(question) {

            const cancel = requests.get(question)

            requests.delete(question)

            cancel?.()
        }
    }
}

type HostWait = {

    endHostWait(process: Process, server: ServerProcessBoundary, question: string, args: unknown[]): Promise<void>
}

// Readiness listeners and their cancellation belong to the exact Server
// incarnation that asked. A replacement must neither inherit the answer nor
// retain the target listeners.
{
    const manager = processManager()
    const requester = await register(manager, "requester")
    const target = await register(manager, "target")
    const original = boundaryProbe()
    const replacement = boundaryProbe()
    let readyListeners = 0
    let exitListeners = 0
    let becomeReady: () => void = () => undefined

    target.waitReady = (_endpoint, notify) => {

        let active = true

        readyListeners++
        becomeReady = notify

        return () => {

            if (!active) return

            active = false
            readyListeners--
        }
    }

    target.onExit = () => {

        let active = true

        exitListeners++

        return () => {

            if (!active) return

            active = false
            exitListeners--
        }
    }

    requester.server = original.boundary

    await (manager as unknown as HostWait).endHostWait(
        requester,
        original.boundary,
        "ready",
        ["wait-ready", { identity: target.identity, reference: target.reference }, "server", false]
    )

    requester.server = replacement.boundary
    becomeReady()

    assert.equal(readyListeners, 0)
    assert.equal(exitListeners, 0)
    assert.deepEqual(original.deliveries, [["host-end", "answer", "ready", { success: true, result: [] }]])
    assert.deepEqual(replacement.deliveries, [])

    await (manager as unknown as HostWait).endHostWait(
        requester,
        original.boundary,
        "cancelled",
        ["wait-ready", { identity: target.identity, reference: target.reference }, "server", false]
    )

    assert.equal(readyListeners, 1)
    assert.equal(exitListeners, 1)

    original.cancel("cancelled")

    assert.equal(readyListeners, 0)
    assert.equal(exitListeners, 0)
    assert.equal(original.deliveries.length, 1)
}
