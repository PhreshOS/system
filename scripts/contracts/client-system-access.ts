import assert from "node:assert/strict"
import type AuthManager from "@client/core/link-manager/auth-manager/auth-manager"
import SystemAccess from "@client/view/components/desktop-host/system-access"

const owner = { identity: "process:owner", program: "owner" }
const sibling = { identity: "process:sibling", program: "owner" }
const outside = { identity: "process:outside", program: "outside" }
let unrestricted = false

const authManager = {
    processManager: { processes: new Map([
        [owner.identity, owner],
        [sibling.identity, sibling],
        [outside.identity, outside]
    ]) },
    async grantsPermission(process: string, name: "all", values: readonly never[]) {

        assert.equal(process, owner.identity)
        assert.equal(name, "all")
        assert.deepEqual(values, [])

        return unrestricted
    }
} as unknown as AuthManager

const access = new SystemAccess(authManager, owner.identity)
const ownProgram = { identity: "owner" }
const ownService = { program: "owner", process: "main", endpoint: "server" } as const
const ownExactService = { process: sibling.identity, endpoint: "client" } as const
const outsideService = { program: "outside", process: "main", endpoint: "server" } as const

assert(access.ownsProgram({ identity: "owner" }))
assert(!access.ownsProgram({ identity: "outside" }))
assert(access.ownsProcess(sibling as never))
assert(!access.ownsProcess(outside as never))
assert(access.ownsService(ownService))
assert(access.ownsService(ownExactService))
assert(!access.ownsService(outsideService))
assert.equal(await access.program(ownProgram as never), ownProgram)
assert.equal(await access.service(ownService), ownService)
assert.equal(await access.service(ownExactService), ownExactService)
await assert.rejects(access.program({ identity: "outside" } as never), /Execution is not permitted/)
await assert.rejects(access.process(outside as never), /Execution is not permitted/)
await assert.rejects(access.service(outsideService), /Execution is not permitted/)
await assert.rejects(access.requireAll(), /Execution is not permitted/)

unrestricted = true

assert.equal((await access.program({ identity: "outside" } as never)).identity, "outside")
assert.equal((await access.process(outside as never)).identity, outside.identity)
assert.equal(await access.service(outsideService), outsideService)
await access.requireAll()
