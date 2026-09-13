import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { TheLink } from "@the-link/core"
import { expect, test, vi } from "vitest"
import type { Launch } from "@phreshos/core"
import FileManager from "@libs/file-manager"
import type AuthManager from "@server/core/link-manager/auth-manager/auth-manager"
import Program from "@server/core/link-manager/auth-manager/program-manager/program"
import ProgramManager from "@server/core/link-manager/auth-manager/program-manager/program-manager"
import { readPermissions, writePermissions } from "@server/core/link-manager/auth-manager/program-manager/permissions"
import * as startup from "@server/core/link-manager/auth-manager/program-manager/startup"

test("installation replaces startup and permissions before launching exactly once", async context => {
  const directory = mkdtempSync(join(tmpdir(), "phresh-startup-"))
  context.onTestFinished(() => { vi.restoreAllMocks(); rmSync(directory, { recursive: true, force: true }) })
  const client = join(directory, "client")
  mkdirSync(client)
  writeFileSync(join(client, "index.html"), "<!doctype html>")

  const auth = Object.assign(new TheLink(), {
    linkManager: { application: { storage: new FileManager(directory, "system"), defaultProgramIcon: "" } },
    processManager: { processes: new Map(), exitAll: vi.fn(), announceHost: vi.fn() }
  }) as unknown as AuthManager
  const manager = new ProgramManager(auth)
  const launches: Launch[] = []
  const start = vi.spyOn(manager as unknown as { start(program: Program, launch: Launch): Promise<string> }, "start")
    .mockImplementation(async (program, launch) => {
      expect(startup.readStartup(program)).toEqual(launch)
      expect(readPermissions(program)).toEqual({ network: ["https://new.example.test"] })
      launches.push(launch)
      return "process-identity"
    })
  function definition(setting?: boolean | Launch) {
    return new Program({
      identity: "example", startup: setting, options: { language: "en" },
      client: { location: client, permissions: { network: ["https://new.example.test"] } }
    })
  }

  let entry = await manager.install(definition(true))
  expect(launches).toEqual([{}])
  const note = join(entry.program.storagePath, "note.txt")
  writeFileSync(note, "keep this")
  writePermissions(entry.program, { network: [], appearance: [] })
  startup.writeStartup(entry.program, { name: "owner-edit" })

  const configured = { name: "welcome", options: { language: "fr" } }
  entry = await manager.install(definition(configured))
  expect(launches).toEqual([{}, configured])
  expect(JSON.parse(readFileSync(join(entry.program.root, "program.json"), "utf8")).options).toEqual({ language: "en" })
  expect(readFileSync(note, "utf8")).toBe("keep this")

  for (const disabled of [false, undefined]) {
    startup.writeStartup(entry.program, configured)
    entry = await manager.install(definition(disabled))
    expect(startup.readStartup(entry.program)).toBeNull()
    expect(start).toHaveBeenCalledTimes(2)
  }

  // A settings write failure restores permissions and leaves the old startup intact.
  writePermissions(entry.program, { appearance: [] })
  startup.writeStartup(entry.program, configured)
  const writing = vi.spyOn(startup, "installStartup").mockImplementationOnce(() => { throw new Error("write failed") })
  await expect(manager.install(definition(true))).rejects.toThrow("write failed")
  expect(readPermissions(entry.program)).toEqual({ appearance: [] })
  expect(startup.readStartup(entry.program)).toEqual(configured)
  writing.mockRestore()

  // Startup failure is reported without undoing a valid installation.
  start.mockRejectedValueOnce(new Error("cannot start"))
  const warnings: string[] = []
  entry = await manager.install(definition(true), null, chunk => { warnings.push(chunk.text) })
  expect(entry.installed).toBe(true)
  expect(startup.readStartup(entry.program)).toEqual({})
  expect(warnings.join("")).toContain("Program installed, but startup failed: cannot start")

  await expect(manager.install(definition({ server: true }))).rejects.toThrow("no server")
  expect(startup.readStartup(entry.program)).toEqual({})
})

test("startup rollback preserves the exact previous file", context => {
  const directory = mkdtempSync(join(tmpdir(), "phresh-startup-rollback-"))
  context.onTestFinished(() => rmSync(directory, { recursive: true, force: true }))
  const program = new Program({ identity: "example", storage: directory, client: { location: "." } })
  const file = join(directory, "startup.json")
  writeFileSync(file, "invalid prior content")
  const rollback = startup.installStartup(program, {})
  expect(startup.readStartup(program)).toEqual({})
  rollback()
  expect(readFileSync(file, "utf8")).toBe("invalid prior content")
})
