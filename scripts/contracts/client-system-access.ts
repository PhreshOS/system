import assert from "node:assert/strict"
import type AuthManager from "@client/core/link-manager/auth-manager/auth-manager"
import SystemAccess from "@client/view/components/desktop-host/system-access"

const owner = { identity: "process:owner", program: "owner" }
const sibling = { identity: "process:sibling", program: "owner" }
const outside = { identity: "process:outside", program: "outside" }
let unrestricted = false

const authManager = {
    processManager: { processes: new Map([[owner.identity, owner]]) },
    async grantsPermission(process: string, name: string, values: readonly string[]) {

        assert.equal(process, owner.identity)
        assert.equal(name, "all")
        assert.deepEqual(values, [])

        return unrestricted
    }
} as unknown as AuthManager

const access = new SystemAccess(authManager, owner.identity)
const ownProgram = { identity: "owner" }

assert(access.ownsProgram({ identity: "owner" }))
assert(!access.ownsProgram({ identity: "outside" }))
assert(access.ownsProcess(sibling as never))
assert(!access.ownsProcess(outside as never))
assert.equal(await access.program(ownProgram as never), ownProgram)
await assert.rejects(access.program({ identity: "outside" } as never), /Execution is not permitted/)
await assert.rejects(access.process(outside as never), /Execution is not permitted/)
await assert.rejects(access.requireAll(), /Execution is not permitted/)

unrestricted = true

assert.equal((await access.program({ identity: "outside" } as never)).identity, "outside")
assert.equal((await access.process(outside as never)).identity, outside.identity)
await access.requireAll()
