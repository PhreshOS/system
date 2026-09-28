import assert from "node:assert/strict"
import ProgramManager from "@server/core/link-manager/auth-manager/program-manager/program-manager"
import type { ClientLaunch } from "@phreshos/core"
import type Program from "@server/core/link-manager/auth-manager/program-manager/program"
import { test } from "vitest"

test("client launch contract", async () => {
  const manager = {
    authManager: {
      processManager: {
        processes: new Map()
      }
    }
  }

  const program = {
    client: { header: false, title: "Declared client title" },
    title: "Declared title"
  }

  const shape = (overrides: ClientLaunch) => ProgramManager.prototype.clientShape.call(
    manager as unknown as ProgramManager,
    program as unknown as Program,
    overrides
  )

  assert.equal(shape({ title: "Fetched title" }).title, "Fetched title")
  assert.equal(shape({}).title, "Declared client title")
  assert.throws(() => shape({ title: 42 } as unknown as ClientLaunch), /title must be text/)
  assert.equal(shape({ header: false }).header, false)
  assert.equal(shape({}).header, false)
  assert.equal(shape({ layer: "over", header: false }).header, false)
  assert.throws(() => shape({ header: "hidden" } as unknown as ClientLaunch), /header state/)

  // What neither the launch nor the Program names is filled the same way in every layer.
  const bare = { client: {}, title: "Bare" }
  const bareShape = (overrides: ClientLaunch) => ProgramManager.prototype.clientShape.call(manager as unknown as ProgramManager, bare as unknown as Program, overrides)
  for (const layer of ["window", "under", "over", "shell", "wallpaper"] as const) {
    const filled = bareShape({ layer })
    assert.deepEqual(filled.size, { width: 500, height: 500 })
    assert.deepEqual(filled.position, { x: -250, y: -250 })
    assert.equal(filled.header, true)
  }
  // A size that is named is centered on zero too, shares and pixels alike.
  assert.deepEqual(bareShape({ size: { width: 800, height: "1/2" } }).position, { x: -400, y: "-25%" })
  assert.deepEqual(bareShape({ size: { width: "1/2 + 100", height: 0 } }).position, { x: "-25% - 50", y: 0 })
  // A position that is named is kept.
  assert.deepEqual(bareShape({ position: { x: 0, y: 0 } }).position, { x: 0, y: 0 })
}, 120_000)
