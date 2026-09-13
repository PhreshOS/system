import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PermissionName, PermissionRequest } from "@phreshos/core"
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
    process.startClient(new Window({ title: "Client", layer: "window" }, { x: 0, y: 0 }, { width: 640, height: 480 }, 1, false), false)

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
    // Stored authority never bypasses approval, even for a narrower request.
    writePermissions(program, { services: ["browser", "editor"] })
    assert.equal(await request("services", ["browser"]), null)
    assert.equal(dialogs, 1)
    assert.deepEqual(readPermissions(program), { services: ["browser", "editor"] })

    choice = false
    assert.equal(await request("services", ["browser"]), false)
    assert.equal(dialogs, 2)
    assert.deepEqual(readPermissions(program), { services: ["browser", "editor"] })

    // Approval replaces the exact permission instead of widening or merging it.
    choice = true
    assert.deepEqual(await request("services", ["browser"]), ["browser"])
    assert.equal(dialogs, 3)
    assert.deepEqual(readPermissions(program), { services: ["browser"] })

    // A concurrent edit cannot turn one approved request into a broader grant.
    whilePending = () => writePermissions(program, { services: ["editor"] })
    assert.deepEqual(await request("services", ["browser"]), ["browser"])
    assert.deepEqual(readPermissions(program), { services: ["browser"] })
    whilePending = undefined

    // An exact assignment restricts a broader fallback grant. Otherwise an
    // approved narrowing request would change the file without changing authority.
    writePermissions(program, { all: [] })
    assert.deepEqual(await request("network", ["https://api.example.com"]), ["https://api.example.com"])
    assert(programManager.grantsPermission(program, "network", ["https://api.example.com/v1"]))
    assert(!programManager.grantsPermission(program, "network", ["https://other.example.com"]))

    // Program declarations are installation input, never a second live source.
    const declared = new Program({ identity: "declared", storage: temporary, client: { location: ".", permissions: { programs: ["browser"] } } })
    writePermissions(declared, { services: ["editor"] })
    assert(!programManager.grantsPermission(declared, "services", ["browser"]))
    assert(programManager.grantsPermission(declared, "services", ["editor"]))

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
