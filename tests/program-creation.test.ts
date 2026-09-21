import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { TheLink } from "@the-link/core"
import { expect, test, vi, type TestContext } from "vitest"
import type { ProgramPermissionDeclarations } from "@phreshos/core"
import FileManager from "@libs/file-manager"
import type AuthManager from "@server/core/link-manager/auth-manager/auth-manager"
import ProgramManager from "@server/core/link-manager/auth-manager/program-manager/program-manager"
import ProgramStateStorage from "@server/core/link-manager/auth-manager/program-manager/state"
import Program from "@server/core/link-manager/auth-manager/program-manager/program"

function fixture(context: TestContext) {
    const directory = mkdtempSync(join(tmpdir(), "phresh-program-creation-"))
    context.onTestFinished(() => rmSync(directory, { recursive: true, force: true }))
    const client = join(directory, "client")
    mkdirSync(client)
    writeFileSync(join(client, "index.html"), "<!doctype html>")
    const announceHost = vi.fn()
    const auth = Object.assign(new TheLink(), {
        linkManager: { application: { storage: new FileManager(directory, "system"), defaultProgramIcon: "" } },
        processManager: { processes: new Map(), exitAll: vi.fn(), announceHost, announceSubject: vi.fn(), updateClientAccess: vi.fn() }
    }) as unknown as AuthManager
    const manager = new ProgramManager(auth)
    function definition(permissions?: ProgramPermissionDeclarations) {
        return { identity: "example", storage: join(directory, "data"), permissions, client: { location: client } }
    }
    return { directory, client, manager, announceHost, definition }
}

test("a Program definition supplies permission fallback without initializing state", async context => {
    const { manager, definition } = fixture(context)
    const program = await manager.create(definition({ network: ["https://api.example.test/**"], uploads: true }))

    expect(manager.permissions(program)).toEqual({ network: ["https://api.example.test"], uploads: [] })
    expect(existsSync(join(program.storagePath, "state.json"))).toBe(false)
})

test("stored permission assignments override definition fallbacks by name", async context => {
    const { manager, definition } = fixture(context)
    let program = await manager.create(definition({ network: ["https://api.example.test"], uploads: true }))
    await manager.setPermission(program, "network", false)
    await manager.setPermission(program, "appearance", true)

    expect(manager.permissions(program)).toEqual({ network: false, uploads: [], appearance: [] })

    program = await manager.forceCreate(definition({ network: true, services: ["editor"] }))
    expect(manager.permissions(program)).toEqual({ network: false, services: ["editor"], appearance: [] })
})

test("a Program definition resolves System-owned paths into reusable creation input", context => {
    const { client } = fixture(context)
    const program = new Program({ identity: "example", client: { location: client } })

    expect(program.definition()).toEqual({
        identity: "example",
        version: "0.0.0",
        storage: program.storagePath,
        client: { location: client }
    })
})

test("startup and pinned state share one file without overwriting each other", async context => {
    const { manager, definition } = fixture(context)
    const program = await manager.create(definition())
    const startup = { name: "background", options: { mode: "quiet" } }

    await manager.startup(program, "enable", startup)
    await manager.pinned(program, "pin")
    await manager.setPermission(program, "network", false)

    expect(await manager.startup(program, "get")).toEqual(startup)
    expect(await manager.pinned(program, "get")).toBe(true)
    expect(new ProgramStateStorage(program).permissions()).toEqual({ network: false })
    expect(JSON.parse(readFileSync(join(program.storagePath, "state.json"), "utf8"))).toEqual({
        startup,
        pinned: true,
        permissions: { network: false }
    })

    await manager.startup(program, "disable")
    await manager.pinned(program, "unpin")
    expect(await manager.startup(program, "get")).toBeNull()
    expect(await manager.pinned(program, "get")).toBe(false)
    expect(new ProgramStateStorage(program).permissions()).toEqual({ network: false })
})

test("Program state mutations do not rewrite an already-satisfied value", async context => {
    const { manager, definition } = fixture(context)
    const program = await manager.create(definition())
    const startupWrite = vi.spyOn(ProgramStateStorage.prototype, "setStartup")
    const permissionWrite = vi.spyOn(ProgramStateStorage.prototype, "setPermission")
    context.onTestFinished(() => { startupWrite.mockRestore(); permissionWrite.mockRestore() })

    await manager.startup(program, "enable", { name: "background" })
    await manager.startup(program, "enable", { name: "background" })
    await manager.setPermission(program, "network", false)
    await manager.setPermission(program, "network", false)
    await manager.startup(program, "disable")
    await manager.startup(program, "disable")

    expect(startupWrite).toHaveBeenCalledTimes(2)
    expect(permissionWrite).toHaveBeenCalledTimes(1)
})

test("pinning emits Program and global events only when the boolean changes", async context => {
    const { manager, definition, announceHost } = fixture(context)
    const program = await manager.create(definition())
    announceHost.mockClear()

    await manager.pinned(program, "pin")
    await manager.pinned(program, "pin")
    await manager.pinned(program, "unpin")

    expect(announceHost.mock.calls.map(([, event, , , pinned]) => [event, pinned])).toEqual([
        ["pinned", true],
        ["pinned", false]
    ])
})

test("boot reconstruction reads startup and permissions from state", async context => {
    const { manager, definition, client } = fixture(context)
    const directory = manager.fileManager.join("example")
    mkdirSync(join(directory, "storage"), { recursive: true })
    writeFileSync(join(directory, "program.json"), JSON.stringify({ ...definition({ all: true }), storage: "storage", client: { location: client } }))
    const startup = { name: "saved-startup" }
    writeFileSync(join(directory, "storage", "state.json"), JSON.stringify({ startup, permissions: { network: false }, pinned: true }))
    const start = vi.spyOn(manager as unknown as { start(program: Program, launch: unknown): Promise<string> }, "start").mockResolvedValue("process")

    await manager.initialize()
    const program = manager.find("example").program
    expect(manager.permissions(program)).toEqual({ all: [], network: false })
    expect(await manager.pinned(program, "get")).toBe(true)
    expect(start).toHaveBeenCalledExactlyOnceWith(program, startup)
})

test("invalid creation leaves existing state and registry unchanged", async context => {
    const { manager, definition, directory } = fixture(context)
    const program = await manager.create(definition({ network: true }))
    await manager.setPermission(program, "network", false)

    await expect(manager.create(definition({ all: true }))).rejects.toThrow("identity")
    await expect(manager.forceCreate({ ...definition({ all: true }), client: { location: join(directory, "missing") } })).rejects.toThrow()

    expect(manager.find(program.identity).program).toBe(program)
    expect(manager.permissions(program)).toEqual({ network: false })
})
