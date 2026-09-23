import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Permission, PermissionName, PermissionRequest } from "@phreshos/core"
import Program from "@server/core/link-manager/auth-manager/program-manager/program"
import ProgramManager from "@server/core/link-manager/auth-manager/program-manager/program-manager"
import ProcessManager from "@server/core/link-manager/auth-manager/process-manager/process-manager"
import Process from "@server/core/link-manager/auth-manager/process-manager/process"
import Window from "@server/core/link-manager/auth-manager/process-manager/window"
import type HostTraffic from "@server/core/link-manager/auth-manager/process-manager/host-traffic"
import ProgramStateStorage from "@server/core/link-manager/auth-manager/program-manager/state"
import { test } from "vitest"

test("permission requests contract", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "phresh-permission-requests-"))

  try {
      const program = new Program({ identity: "example", storage: temporary, client: { location: "." } })
      let dialogs = 0
      let choice: boolean | null = null
      let whilePending: (() => void) | undefined
      let dialogProgram: Program | null = null

      const process = new Process("process", null, program, {}, { server: null, client: null, options: {} }, null, {} as HostTraffic,
          new Window({ title: "Client", header: true, surface: true, transaction: false, layer: "window" }, { x: 0, y: 0 }, { width: 640, height: 480 }, 1, false))
      process.startClient(false)

      const authManager = {
          dialogManager: {
              async requestPermission(target: Program) {
                  dialogProgram = target
                  dialogs++
                  whilePending?.()
                  return choice
              }
          }
      }
      const programManager = Object.assign(Object.create(ProgramManager.prototype), { authManager }) as ProgramManager
      const processManager = Object.assign(Object.create(ProcessManager.prototype), {
          authManager,
          processes: new Map([["process", process]])
      }) as ProcessManager
      Object.assign(authManager, { programManager, processManager })

      const request = <Name extends PermissionName>(name: Name, value: PermissionRequest<Name> = true) => (
          programManager.requestPermission(program, "request", name, value, process)
      )
      const stored = () => new ProgramStateStorage(program).permissions()
      const assign = <Name extends PermissionName>(name: Name, value: Exclude<Permission<Name>, null>) => (
          new ProgramStateStorage(program).setPermission(name, value)
      )
      // Stored authority never bypasses approval, even for a narrower request.
      assign("services", ["browser", "editor"])
      assert.equal(await request("services", ["browser"]), null)
      assert.equal(dialogs, 1)
      assert.deepEqual(stored(), { services: ["browser", "editor"] })

      choice = false
      assert.equal(await request("services", ["browser"]), false)
      assert.equal(dialogs, 2)
      assert.deepEqual(stored(), { services: ["browser", "editor"] })

      // Approval replaces the exact permission instead of widening or merging it.
      choice = true
      assert.deepEqual(await request("services", ["browser"]), ["browser"])
      assert.equal(dialogs, 3)
      assert.deepEqual(stored(), { services: ["browser"] })

      // Canonically equal authority already satisfies the request without an
      // owner decision, while array order has no permission meaning.
      choice = null
      assert.deepEqual(await request("services", ["browser"]), ["browser"])
      assert.equal(dialogs, 3)
      assign("services", ["editor", "browser"])
      assert.deepEqual(await request("services", ["browser", "editor"]), ["browser", "editor"])
      assert.equal(dialogs, 3)

      // A Program handle requests for its target; the initiating Process is
      // only the request lifetime owner and never retargets the assignment.
      choice = true
      const target = new Program({ identity: "target", storage: join(temporary, "target"), permissions: {}, server: { location: ".", command: "node server.js" } })
      assert.deepEqual(await programManager.requestPermission(target, "owner-request", "uploads", true), [])
      assert.equal(dialogProgram, target)
      assert.deepEqual(new ProgramStateStorage(target).permissions(), { uploads: [] })
      assert.equal(stored().uploads, undefined)

      // A concurrent edit cannot turn one approved request into a broader grant.
      whilePending = () => assign("services", ["editor"])
      assert.deepEqual(await request("services", ["browser"]), ["browser"])
      assert.deepEqual(stored(), { services: ["browser"] })
      whilePending = undefined

      // An exact assignment restricts a broader fallback grant. Otherwise an
      // approved narrowing request would change the file without changing authority.
      assign("all", [])
      assert.deepEqual(await request("network", ["https://api.example.com"]), ["https://api.example.com"])
      assert(programManager.grantsPermission(program, "network", ["https://api.example.com/v1"]))
      assert(!programManager.grantsPermission(program, "network", ["https://other.example.com"]))

      // Permission decisions read the authoritative stored state.
      const declared = new Program({ identity: "declared", storage: temporary, permissions: { programs: ["browser"] }, client: { location: "." } })
      new ProgramStateStorage(declared).setPermission("services", ["editor"])
      assert(!programManager.grantsPermission(declared, "services", ["browser"]))
      assert(programManager.grantsPermission(declared, "services", ["editor"]))
      const dialogsBeforeDeclaredMatch = dialogs
      assert.deepEqual(await programManager.requestPermission(declared, "declared-match", "programs", ["browser"]), ["browser"])
      assert.equal(dialogs, dialogsBeforeDeclaredMatch)

      assign("all", false)
      assert.deepEqual(await request("all"), [])
      await programManager.setPermission(program, "all", [])
      await programManager.setPermission(program, "all", false)
      assert.equal(programManager.permission(program, "all"), false)
  }
  finally {
      rmSync(temporary, { recursive: true, force: true })
  }
}, 120_000)
