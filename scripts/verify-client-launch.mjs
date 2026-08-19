import assert from "node:assert/strict"
import ProgramManager from "../source/server/core/link-manager/auth-manager/program-manager/program-manager.ts"

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

const shape = overrides => ProgramManager.prototype.clientShape.call(manager, program, overrides)

assert.equal(shape({ title: "Fetched title" }).title, "Fetched title")
assert.equal(shape({}).title, "Declared title")
assert.throws(() => shape({ title: 42 }), /title must be text/)
