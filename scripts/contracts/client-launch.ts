import assert from "node:assert/strict"
import ProgramManager from "@server/core/link-manager/auth-manager/program-manager/program-manager"
import type { ClientLaunch } from "@phreshos/core"
import type Program from "@server/core/link-manager/auth-manager/program-manager/program"

const manager = {
  authManager: {
    processManager: {
      processes: new Map()
    }
  }
}

const program = {
  client: {},
  clientLocation: "/client",
  title: "Declared title"
}

const shape = (overrides: ClientLaunch) => ProgramManager.prototype.clientShape.call(
  manager as unknown as ProgramManager,
  program as unknown as Program,
  overrides
)

assert.equal(shape({ title: "Fetched title" }).title, "Fetched title")
assert.equal(shape({}).title, "Declared title")
assert.throws(() => shape({ title: 42 } as unknown as ClientLaunch), /title must be text/)
