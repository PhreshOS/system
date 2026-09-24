import assert from "node:assert/strict"
import { TheLink } from "@the-link/core"
import ClientProcessManager from "@client/core/link-manager/auth-manager/process-manager/process-manager"
import ClientProgramManager from "@client/core/link-manager/auth-manager/program-manager/program-manager"
import { test } from "vitest"

test("process collection subscription closes the snapshot and subscription gap", async () => {
    const connection = new TheLink()
    const manager = new ClientProcessManager(connection as never, { processes: [] })
    const process = { identity: "created-before-subscription" }

    // This mutation represents an event received after a view read the old
    // snapshot but before React installed its subscription.
    manager.processes.set(process.identity, process as never)

    const collections: string[][] = []
    const unsubscribe = manager.subscribeProcesses(processes => {
        collections.push(processes.map(current => current.identity))
    })

    assert.deepEqual(collections, [[process.identity]])

    const next = { identity: "created-after-subscription" }
    manager.processes.set(next.identity, next as never)
    await manager.changed()

    assert.deepEqual(collections.at(-1), [process.identity, next.identity])

    unsubscribe()
    manager.processes.delete(process.identity)
    await manager.changed()

    assert.deepEqual(collections.at(-1), [process.identity, next.identity])
})

test("program collection subscription closes the snapshot and subscription gap", async () => {
    const connection = new TheLink()
    const manager = new ClientProgramManager(connection as never, { programs: [] })
    const program = { identity: "installed-before-subscription" }

    manager.programs.set(program.identity, program as never)

    const collections: string[][] = []
    const unsubscribe = manager.subscribePrograms(programs => {
        collections.push(programs.map(current => current.identity))
    })

    assert.deepEqual(collections, [[program.identity]])

    unsubscribe()
})
