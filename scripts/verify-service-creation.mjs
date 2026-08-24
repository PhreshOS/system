import assert from "node:assert/strict"
import ProcessManager from "../source/server/core/link-manager/auth-manager/process-manager/process-manager.ts"

const requester = { identity: "requester" }
const program = {
    identity: "browser",
    server: { serviceDocs: "server-docs.md" },
    client: { serviceDocs: "client-docs.md" }
}

const launches = []
const waits = []
let alreadyEnabled = false

const manager = Object.assign(Object.create(ProcessManager.prototype), {
    processes: new Map([[requester.identity, requester]]),
    services: {
        enabled: () => alreadyEnabled,
        identity: key => `identity-${key.endpoint}`,
        waitReady: async (key, timeout) => waits.push({ key, timeout })
    },
    authManager: {
        programManager: {
            reach: identity => identity === program.identity ? program : null,
            findOrCreateProcess: async (identity, launch, parent) => {
                launches.push({ identity, launch, parent })
            }
        }
    }
})

const server = { program: "browser", endpoint: "server", name: "browser" }

await manager.createAndWaitServiceReady(requester.identity, server, undefined, 1_000)

assert.deepEqual(launches[0], {
    identity: "browser",
    launch: {
        name: "service:identity-server",
        server: true,
        client: false
    },
    parent: requester
})
assert.equal(waits[0].key, server)
assert(waits[0].timeout >= 0 && waits[0].timeout <= 1_000)

const client = { program: "browser", endpoint: "client", name: "browser-window" }
const clientLaunch = { minimize: true }

await manager.createAndWaitServiceReady(requester.identity, client, clientLaunch, 1_000)

assert.deepEqual(launches[1], {
    identity: "browser",
    launch: {
        name: "service:identity-client",
        server: false,
        client: clientLaunch
    },
    parent: requester
})

await assert.rejects(
    () => manager.createAndWaitServiceReady(requester.identity, server, {}, 1_000),
    /does not accept Client launch configuration/
)

alreadyEnabled = true

await manager.createAndWaitServiceReady(requester.identity, server, undefined, 1_000)

assert.equal(launches.length, 2)
assert.equal(waits.length, 2)
