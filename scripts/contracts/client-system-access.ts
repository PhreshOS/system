import assert from "node:assert/strict"
import type AuthManager from "@client/core/link-manager/auth-manager/auth-manager"
import SystemAccess from "@client/view/components/desktop-host/system-access"
import { permissionCatalog } from "@server/core/permissions"
import type { PermissionName, Permissions } from "@phreshos/core"

const owner = { identity: "process:owner", program: "owner" }
const sibling = { identity: "process:sibling", program: "owner" }
const outside = { identity: "process:outside", program: "outside" }
let permissions: Permissions = {}

const authManager = {
    processManager: { processes: new Map([
        [owner.identity, owner],
        [sibling.identity, sibling],
        [outside.identity, outside]
    ]) },
    async grantsPermission(process: string, name: PermissionName, values: readonly string[]) {

        assert.equal(process, owner.identity)

        return permissionCatalog.allows(name, permissions.all ?? null, permissions[name] ?? null, values as never)
    }
} as unknown as AuthManager

const access = new SystemAccess(authManager, owner.identity)
const ownProgram = { identity: "owner" }
const outsideProgram = { identity: "outside" }
const ownService = { program: "owner", process: "main", endpoint: "server" } as const
const ownExactService = { process: sibling.identity, endpoint: "client" } as const
const outsideService = { program: "outside", process: "main", endpoint: "server" } as const

assert(access.ownsProgram(ownProgram))
assert(!access.ownsProgram(outsideProgram))
assert(access.ownsProcess(sibling as never))
assert(!access.ownsProcess(outside as never))
assert(access.ownsService(ownService))
assert(access.ownsService(ownExactService))
assert(!access.ownsService(outsideService))
assert.equal(await access.program(ownProgram as never), ownProgram)
assert.equal(await access.service(ownService), ownService)
assert.equal(await access.service(ownExactService), ownExactService)
await assert.rejects(access.program(outsideProgram as never), /Execution is not permitted/)
await assert.rejects(access.process(outside as never), /Execution is not permitted/)
await assert.rejects(access.service(outsideService), /Execution is not permitted/)
await assert.rejects(access.requirePrograms(), /Execution is not permitted/)
await assert.rejects(access.requireNetwork("https://api.example.com/v1/users"), /Execution is not permitted/)
await assert.rejects(access.require("appearance", []), /Execution is not permitted/)
await assert.rejects(access.require("desktopPreferences", []), /Execution is not permitted/)

permissions = { services: ["outside"] }

assert.equal(await access.service(outsideService), outsideService)
await assert.rejects(access.program(outsideProgram as never), /Execution is not permitted/)
await assert.rejects(access.process(outside as never), /Execution is not permitted/)
await assert.rejects(access.requirePrograms(), /Execution is not permitted/)

permissions = { services: [] }

assert.equal(await access.service(outsideService), outsideService)
await assert.rejects(access.program(outsideProgram as never), /Execution is not permitted/)
await assert.rejects(access.requirePrograms(), /Execution is not permitted/)

permissions = { programs: ["outside"] }

assert.equal(await access.program(outsideProgram as never), outsideProgram)
assert.equal(await access.process(outside as never), outside)
assert.equal(await access.service(outsideService), outsideService)
await assert.rejects(access.requirePrograms(), /Execution is not permitted/)

permissions = { programs: [] }

await access.requirePrograms()
assert.equal(await access.program(outsideProgram as never), outsideProgram)
assert.equal(await access.service(outsideService), outsideService)

permissions = { appearance: [], desktopPreferences: [] }

await access.require("appearance", [])
await access.require("desktopPreferences", [])
await assert.rejects(access.program(outsideProgram as never), /Execution is not permitted/)

permissions = { network: ["https://*.example.com/v1/**"] }

await access.requireNetwork("https://api.example.com/v1/users")
await assert.rejects(access.requireNetwork("https://example.com/v1/users"), /Execution is not permitted/)
await assert.rejects(access.requireNetwork("https://api.example.com/v2/users"), /Execution is not permitted/)

permissions = { all: [] }

assert.equal((await access.program(outsideProgram as never)).identity, "outside")
assert.equal((await access.process(outside as never)).identity, outside.identity)
assert.equal(await access.service(outsideService), outsideService)
await access.requirePrograms()
await access.require("appearance", [])
await access.require("desktopPreferences", [])
await access.requireNetwork("wss://events.example.com/socket")
await access.requireAll()
