import assert from "node:assert/strict"
import ProgramManager from "@server/core/link-manager/auth-manager/program-manager/program-manager"
import type { Launch } from "@phreshos/core"
import type Program from "@server/core/link-manager/auth-manager/program-manager/program"

interface FixtureProcess {
  identity: string
  name: string | null
  program: Program
  launch: unknown
}

interface FixtureManager {
  start(owner: Program, launch: Launch, watching?: unknown, parent?: unknown, transition?: boolean, prepared?: { intent: unknown }): Promise<`${string}-${string}-${string}-${string}-${string}`>
  resolveLaunch(owner: Program, launch: Launch): { intent: { server: { service: boolean } | null, client: { position: unknown, size: unknown, service: boolean } | null } }
}

const processes = new Map<string, FixtureProcess>()
const program = {
  identity: "example",
  reference: "example-reference",
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
} as unknown as Program

let starts = 0

const manager = Object.assign(Object.create(ProgramManager.prototype), {
  authManager: { processManager: { processes } },
  creating: new Map(),
  $outbound: { async publish() {} },
  reach: (identity: string) => identity === program.identity ? program : null
}) as ProgramManager
const fixture = manager as unknown as FixtureManager

fixture.start = async (owner, launch, _watching, _parent, _transition, prepared) => {
  await Promise.resolve()

  const existing = [...processes.values()].find(process => process.program === owner && process.name === launch.name)
  if (existing) throw new Error("This program already has a process with that name")

  const identity = `00000000-0000-0000-0000-${String(++starts).padStart(12, "0")}` as `${string}-${string}-${string}-${string}-${string}`
  processes.set(identity, {
    identity,
    name: launch.name ?? null,
    program: owner,
    launch: (prepared ?? fixture.resolveLaunch(owner, launch)).intent
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
  manager.findOrCreateProcess(program, launch),
  manager.findOrCreateProcess(program, {
    name: "shared",
    server: true,
    client: false,
    options: { alpha: "1", beta: "2" }
  })
])

assert.equal(first, second)
assert.equal(starts, 1)

await assert.rejects(
  manager.findOrCreateProcess(program, {
    name: "shared",
    server: false,
    client: true,
    options: { alpha: "1", beta: "2" }
  }),
  /different launch/
)

const omitted = fixture.resolveLaunch(program, { name: "defaults" }).intent
processes.set("unrelated", { identity: "unrelated", name: null, program, launch: null })
const explicit = fixture.resolveLaunch(program, {
  name: "defaults",
  server: true,
  client: true
}).intent

assert.deepEqual(omitted, explicit)
assert(omitted.client)
assert.deepEqual(omitted.server, { service: false })
assert.equal(omitted.client.service, false)
assert.equal(omitted.client.position, null)
assert.equal(omitted.client.size, null)

const activated = fixture.resolveLaunch(program, {
  server: { service: true },
  client: { service: true }
}).intent

assert.equal(activated.server?.service, true)
assert.equal(activated.client?.service, true)

const stale = { identity: program.identity, reference: "replaced-program-reference" } as unknown as Program

await assert.rejects(manager.createProcess(stale), /represented by this handle does not exist/)
await assert.rejects(manager.findOrCreateProcess(stale, { name: "stale" }), /represented by this handle does not exist/)
