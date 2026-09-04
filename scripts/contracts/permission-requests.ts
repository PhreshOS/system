import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PermissionName, PermissionRequest, Permissions } from "@phreshos/core"
import Program from "@server/core/link-manager/auth-manager/program-manager/program"
import ProgramManager from "@server/core/link-manager/auth-manager/program-manager/program-manager"
import ProcessManager from "@server/core/link-manager/auth-manager/process-manager/process-manager"
import Process from "@server/core/link-manager/auth-manager/process-manager/process"
import Window from "@server/core/link-manager/auth-manager/process-manager/window"
import type HostTraffic from "@server/core/link-manager/auth-manager/process-manager/host-traffic"
import { readPermissions, writePermissions } from "@server/core/link-manager/auth-manager/program-manager/permissions"

const temporary = mkdtempSync(join(tmpdir(), "phresh-permission-requests-"))

try {
    const program = new Program({ identity: "example", storage: temporary, client: { location: "." } })
    let dialogs = 0
    let choice: boolean | null = null
    let whilePending: (() => void) | undefined
    let accessUpdates = 0

    const process = new Process("process", null, program, {}, { server: null, client: null, options: {} }, null, {} as HostTraffic, false)
    process.startClient(new Window({ title: "Client", layer: "window", location: "/" }, { x: 0, y: 0 }, { width: 640, height: 480 }, 1, false), false)

    const authManager = {
        dialogManager: {
            async requestPermission() {
                dialogs++
                whilePending?.()
                return choice
            }
        }
    }
    const programManager = Object.assign(Object.create(ProgramManager.prototype), { authManager }) as ProgramManager
    const processManager = Object.assign(Object.create(ProcessManager.prototype), {
        authManager,
        processes: new Map([["process", process]]),
        $outbound: { async publish(event: string) {
            assert.equal(event, "/client-access")
            accessUpdates++
        } }
    }) as ProcessManager
    Object.assign(authManager, { programManager, processManager })

    const request = <Name extends PermissionName>(name: Name, value: PermissionRequest<Name> = true) => (
        processManager.requestPermission("process", "request", name, value)
    )
    async function covered<Name extends PermissionName>(permissions: Permissions, name: Name, requested: PermissionRequest<Name>, expected: unknown) {
        writePermissions(program, permissions)
        const stored = readFileSync(join(temporary, "permissions.json"), "utf8")
        const before = dialogs
        assert.deepEqual(await request(name, requested), expected)
        assert.equal(dialogs, before)
        assert.equal(readFileSync(join(temporary, "permissions.json"), "utf8"), stored)
    }

    await covered({ services: [] }, "services", ["browser"], ["browser"])
    await covered({ services: ["browser", "editor"] }, "services", ["browser"], ["browser"])
    await covered({ programs: [] }, "services", ["browser"], ["browser"])
    await covered({ programs: ["browser"] }, "services", ["browser"], ["browser"])
    await covered({ programs: ["browser"], services: ["editor"] }, "services", ["browser", "editor"], ["browser", "editor"])
    await covered({ programs: [], services: false }, "services", ["browser"], ["browser"])
    await covered({ all: [] }, "services", ["browser"], ["browser"])
    await covered({ all: [] }, "network", ["https://example.test"], ["https://example.test"])
    await covered({ network: ["https://example.test/**"] }, "network", ["https://example.test/api"], ["https://example.test/api"])
    await covered({ storage: ["Documents/**"] }, "storage", ["read:Documents/report.txt"], ["read:Documents/report.txt"])
    await covered({ services: [] }, "services", true, [])
    await covered({}, "services", ["example"], ["example"])
    await covered({}, "programs", ["example"], ["example"])

    writePermissions(program, { services: false })
    assert.equal(await request("services", ["browser"]), false)
    assert.equal(dialogs, 0)

    writePermissions(program, {})
    assert.equal(await request("services", ["browser"]), null)
    assert.equal(dialogs, 1)
    assert.deepEqual(readPermissions(program), {})

    choice = false
    assert.equal(await request("services", ["browser"]), false)
    assert.equal(dialogs, 2)
    assert.deepEqual(readPermissions(program), {})

    choice = true
    writePermissions(program, { services: ["editor"] })
    assert.deepEqual(await request("services", ["browser"]), ["browser"])
    assert.equal(dialogs, 3)
    assert.deepEqual(readPermissions(program), { services: ["editor", "browser"] })

    // A pending request must not overwrite a grant saved by another request.
    writePermissions(program, {})
    whilePending = () => writePermissions(program, { services: ["editor"] })
    assert.deepEqual(await request("services", ["browser"]), ["browser"])
    assert.deepEqual(readPermissions(program), { services: ["editor", "browser"] })
    whilePending = undefined

    const declared = new Program({ identity: "declared", storage: temporary, client: { location: ".", permissions: { programs: ["browser"] } } })
    writePermissions(declared, { services: ["editor"] })
    assert(programManager.grantsPermission(declared, "services", ["browser", "editor"]))
    assert(!programManager.allowsPermission(declared, "services", ["browser"]))
    assert(programManager.allowsPermission(declared, "services", ["editor"]))
    writePermissions(declared, { programs: ["browser"] })
    assert(programManager.allowsPermission(declared, "services", ["browser"]))

    // The iframe policy is synchronized independently of permission request results.
    writePermissions(program, {})
    assert.deepEqual(await request("all"), [])
    assert.equal(process.hosted().client?.sameOrigin, true)
    assert.equal(accessUpdates, 1)
    await programManager.setPermission(program, "all", [])
    assert.equal(accessUpdates, 1)
    await programManager.deletePermission(program, "all")
    assert.equal(process.hosted().client?.sameOrigin, false)
    assert.equal(accessUpdates, 2)
}
finally {
    rmSync(temporary, { recursive: true, force: true })
}
