import assert from "node:assert/strict"
import ProgramManager from "../source/server/core/link-manager/auth-manager/program-manager/program-manager.ts"

const processes = new Map()
const program = {
  identity: "example",
  server: { start: true },
  client: {
    start: true,
    position: undefined,
    size: undefined,
    layer: undefined,
    minimize: undefined
  },
  title: "Example",
  clientLocation: "/",
  async validate() {}
}

let starts = 0

const manager = Object.assign(Object.create(ProgramManager.prototype), {
  authManager: { processManager: { processes } },
  creating: new Map(),
  $outbound: { async publish() {} },
  reach: identity => identity === program.identity ? program : null
})

manager.start = async (owner, launch, _watching, _parent, _transition, prepared) => {
  await Promise.resolve()

  const existing = [...processes.values()].find(process => process.program === owner && process.name === launch.name)
  if (existing) throw new Error("This program already has a process with that name")

  const identity = `process-${++starts}`
  processes.set(identity, {
    identity,
    name: launch.name ?? null,
    program: owner,
    launch: (prepared ?? manager.resolveLaunch(owner, launch)).intent
  })
  return identity
}

const launch = {
  name: "shared",
  server: true,
  client: false,
  options: { beta: "2", alpha: "1" }
}

const [first, second] = await Promise.all([
  manager.findOrCreateProcess(program.identity, launch),
  manager.findOrCreateProcess(program.identity, {
    name: "shared",
    server: true,
    client: false,
    options: { alpha: "1", beta: "2" }
  })
])

assert.equal(first, second)
assert.equal(starts, 1)

await assert.rejects(
  manager.findOrCreateProcess(program.identity, {
    name: "shared",
    server: false,
    client: true,
    options: { alpha: "1", beta: "2" }
  }),
  /different launch/
)

const omitted = manager.resolveLaunch(program, { name: "defaults" }).intent
processes.set("unrelated", { program })
const explicit = manager.resolveLaunch(program, {
  name: "defaults",
  server: true,
  client: true
}).intent

assert.deepEqual(omitted, explicit)
assert.equal(omitted.client.position, null)
assert.equal(omitted.client.size, null)
