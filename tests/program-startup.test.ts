import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
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
import LaunchStorage from "@server/core/link-manager/auth-manager/program-manager/launch-storage"

test("installation applies active declarations and launches the stored startup", async context => {
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
      expect(new LaunchStorage(program, "startup").get()).toEqual(launch)
      launches.push(launch)
      return "process-identity"
    })
  function definition(setting?: boolean | Launch) {
    return new Program({
      identity: "example", startup: setting, options: { language: "en" },
      client: { location: client, permissions: { network: ["https://new.example.test"] } }
    })
  }

  let entry = await manager.install(definition())
  expect(existsSync(join(entry.program.storagePath, "startup.json"))).toBe(false)
  expect(start).not.toHaveBeenCalled()
  entry = await manager.install(definition(false))
  expect(existsSync(join(entry.program.storagePath, "startup.json"))).toBe(false)
  expect(start).not.toHaveBeenCalled()

  entry = await manager.install(definition(true))
  expect(launches).toEqual([{}])
  expect(readPermissions(entry.program)).toEqual({ network: ["https://new.example.test"] })
  const note = join(entry.program.storagePath, "note.txt")
  writeFileSync(note, "keep this")
  writePermissions(entry.program, { network: [], appearance: [] })
  new LaunchStorage(entry.program, "startup").set({ name: "owner-edit" })

  const configured = { name: "welcome", options: { language: "fr" } }
  entry = await manager.install(definition(configured))
  expect(launches).toEqual([{}, configured])
  expect(JSON.parse(readFileSync(join(entry.program.root, "program.json"), "utf8")).options).toEqual({ language: "en" })
  expect(readFileSync(note, "utf8")).toBe("keep this")
  expect(readPermissions(entry.program)).toEqual({ network: [], appearance: [] })

  for (const inactive of [false, undefined]) {
    new LaunchStorage(entry.program, "startup").set(configured)
    entry = await manager.install(definition(inactive))
    expect(new LaunchStorage(entry.program, "startup").get()).toEqual(configured)
    expect(launches.at(-1)).toEqual(configured)
  }
  expect(start).toHaveBeenCalledTimes(4)

  // A settings write failure leaves the authoritative stored state intact.
  writePermissions(entry.program, { appearance: [] })
  new LaunchStorage(entry.program, "startup").set(configured)
  const writing = vi.spyOn(LaunchStorage.prototype, "replace").mockImplementationOnce(() => { throw new Error("write failed") })
  await expect(manager.install(definition(true))).rejects.toThrow("write failed")
  expect(readPermissions(entry.program)).toEqual({ appearance: [] })
  expect(new LaunchStorage(entry.program, "startup").get()).toEqual(configured)
  writing.mockRestore()

  // Startup failure is reported without undoing a valid installation.
  start.mockRejectedValueOnce(new Error("cannot start"))
  const warnings: string[] = []
  entry = await manager.install(definition(true), null, chunk => { warnings.push(chunk.text) })
  expect(entry.installed).toBe(true)
  expect(new LaunchStorage(entry.program, "startup").get()).toEqual({})
  expect(warnings.join("")).toContain("Program installed, but startup failed: cannot start")

  await expect(manager.install(definition({ server: true }))).rejects.toThrow("no server")
  expect(new LaunchStorage(entry.program, "startup").get()).toEqual({})
})

test("startup rollback preserves the exact previous file", context => {
  const directory = mkdtempSync(join(tmpdir(), "phresh-startup-rollback-"))
  context.onTestFinished(() => rmSync(directory, { recursive: true, force: true }))
  const program = new Program({ identity: "example", storage: directory, client: { location: "." } })
  const file = join(directory, "startup.json")
  writeFileSync(file, "invalid prior content")
  const rollback = new LaunchStorage(program, "startup").replace({})
  expect(new LaunchStorage(program, "startup").get()).toEqual({})
  rollback()
  expect(readFileSync(file, "utf8")).toBe("invalid prior content")
})
