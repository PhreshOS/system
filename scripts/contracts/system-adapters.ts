import assert from "node:assert/strict"
import ProcessManager from "@server/core/link-manager/auth-manager/process-manager/process-manager"
import systemRequest from "@server/view/gateway/system-request"
import type Application from "@server/core/application"
import type Process from "@server/core/link-manager/auth-manager/process-manager/process"
import type ServerProcessBoundary from "@server/core/link-manager/auth-manager/process-manager/server-process-boundary"

const calls: unknown[][] = []
const entry = {
    identity: "example",
    installed: true,
    program: {
        identity: "example",
        name: "Example",
        config: { description: null }
    }
}
const system = {
    listPrograms(onlyInstalled: boolean) {

        calls.push(["listPrograms", onlyInstalled])
        return [entry]
    },
    programSnapshot() {

        return { identity: "example" }
    }
}
const application = { system } as unknown as Application

const gateway = await systemRequest(application, {
    capability: "program",
    operation: "list",
    input: { installedOnly: true }
}, new AbortController().signal)

const serverAdapter = {
    system,
    authManager: {
        programManager: {},
        linkManager: { application }
    }
}
const server = await (ProcessManager.prototype as unknown as {
    endHost(process: Process, boundary: ServerProcessBoundary, values: unknown[]): Promise<unknown[]>
}).endHost.call(
    serverAdapter,
    {} as Process,
    {} as ServerProcessBoundary,
    ["host-program-list", true]
)

assert.deepEqual(gateway, { data: [{ identity: "example" }], total: 1, truncated: false })
assert.deepEqual(server, [[entry]])
assert.deepEqual(calls, [
    ["listPrograms", true],
    ["listPrograms", true]
])
