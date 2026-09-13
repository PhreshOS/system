import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { TheLink } from "@the-link/core"
import { expect, test, vi, type TestContext } from "vitest"
import type { ClientPermissionDeclarations } from "@phreshos/core"
import FileManager from "@libs/file-manager"
import type AuthManager from "@server/core/link-manager/auth-manager/auth-manager"
import ProgramManager from "@server/core/link-manager/auth-manager/program-manager/program-manager"
import { readPermissions, writePermissions } from "@server/core/link-manager/auth-manager/program-manager/permissions"
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
        processManager: { processes: new Map(), exitAll: vi.fn(), announceHost, announceSubject: vi.fn() }
    }) as unknown as AuthManager
    const manager = new ProgramManager(auth)
    function definition(permissions?: ClientPermissionDeclarations) {
        return { identity: "example", storage: join(directory, "data"), client: { location: client, permissions } }
    }
    return { directory, client, manager, announceHost, definition }
}

test("creation establishes declared permissions before announcing the Program", async context => {
    const { manager, definition, announceHost } = fixture(context)
    announceHost.mockImplementation((_domain, event, _identity, entry) => {
        if (event === "create") expect(readPermissions(entry.program)).toEqual({ network: ["https://api.example.test"], uploads: [] })
    })
    const program = await manager.create(definition({ network: ["https://api.example.test/**"], uploads: true }))
    expect(manager.find(program.identity).installed).toBe(false)
    expect(JSON.parse(readFileSync(join(program.storagePath, "permissions.json"), "utf8"))).toEqual({ network: ["https://api.example.test"], uploads: [] })
    expect(announceHost).toHaveBeenCalledOnce()
})

test("creation and force-create replace the complete permission set", async context => {
    const { manager, definition } = fixture(context)
    const first = await manager.create(definition({ all: true }))
    writePermissions(first, { appearance: [] })
    const replacement = await manager.forceCreate(definition({ services: ["example"] }))
    expect(readPermissions(replacement)).toEqual({ services: ["example"] })
    await manager.forget(replacement)
    const empty = await manager.create(definition())
    expect(readPermissions(empty)).toEqual({})
    expect(existsSync(join(empty.storagePath, "permissions.json"))).toBe(true)
})

test("invalid and duplicate creation leave stored authority and registry unchanged", async context => {
    const { manager, definition, directory } = fixture(context)
    const program = await manager.create(definition({ network: true }))
    await expect(manager.create(definition({ all: true }))).rejects.toThrow("identity")
    expect(readPermissions(program)).toEqual({ network: [] })
    await expect(manager.forceCreate({ ...definition({ all: true }), client: { location: join(directory, "missing") } })).rejects.toThrow()
    expect(manager.find(program.identity).program).toBe(program)
    expect(readPermissions(program)).toEqual({ network: [] })
})

test("a permission write failure never publishes a new Program", async context => {
    const { manager, definition, directory, announceHost } = fixture(context)
    const storage = join(directory, "not-a-directory")
    writeFileSync(storage, "keep this")
    await expect(manager.create({ ...definition(), storage })).rejects.toThrow()
    expect(manager.programs.size).toBe(0)
    expect(announceHost).not.toHaveBeenCalled()
    expect(readFileSync(storage, "utf8")).toBe("keep this")
})

test("boot reconstruction preserves stored permission decisions", async context => {
    const { manager, definition, client } = fixture(context)
    const directory = manager.fileManager.join("example")
    mkdirSync(directory)
    writeFileSync(join(directory, "program.json"), JSON.stringify({ ...definition({ all: true }), launch: true, storage: "storage", client: { location: client, permissions: { all: true } } }))
    mkdirSync(join(directory, "storage"))
    writeFileSync(join(directory, "storage", "permissions.json"), JSON.stringify({ network: false }))
    writeFileSync(join(directory, "storage", "launch.json"), JSON.stringify({ options: { document: "saved.txt" } }))
    await manager.initialize()
    expect(readPermissions(manager.find("example").program)).toEqual({ network: false })
    expect(await manager.launch(manager.find("example").program, "get")).toEqual({ options: { document: "saved.txt" } })
})

test("creation writes saved launch intent; omission preserves it and true resets it", async context => {
    const { manager, definition } = fixture(context)
    const intent = { client: { layer: "over" as const }, options: { document: "icon.txt" } }
    let program = await manager.create({ ...definition(), options: { language: "en" }, launch: intent })
    expect(await manager.launch(program, "get")).toEqual(intent)
    expect(manager.authManager.processManager.processes.size).toBe(0)
    program = await manager.forceCreate(definition())
    expect(await manager.launch(program, "get")).toEqual(intent)
    await manager.launch(program, "set", { name: "saved" })
    expect(await manager.launch(program, "get")).toEqual({ name: "saved" })
    program = await manager.forceCreate({ ...definition(), launch: true })
    expect(await manager.launch(program, "get")).toEqual({})
})

test("saved launch operations preserve defaults and reject invalid intent before mutation", async context => {
    const { manager, definition } = fixture(context)
    const program = await manager.create(definition())
    expect(await manager.launch(program, "get")).toBeNull()
    expect(existsSync(join(program.storagePath, "launch.json"))).toBe(false)
    await manager.launch(program, "set", { options: { document: "saved.txt" } })
    for (const value of [undefined, false, { server: true }, { client: false }]) {
        await expect(manager.launch(program, "set", value)).rejects.toThrow()
    }
    await expect(manager.forceCreate({ ...definition(), launch: { server: true } })).rejects.toThrow("no server")
    expect(manager.find("example").program).toBe(program)
    expect(await manager.launch(program, "get")).toEqual({ options: { document: "saved.txt" } })
})

test("installation keeps saved launch settings when updating an existing Program", async context => {
    const { manager, client } = fixture(context)
    let entry = await manager.install(new Program({ identity: "example", client: { location: client }, launch: true }))
    expect(await manager.launch(entry.program, "get")).toEqual({})
    await manager.launch(entry.program, "set", { options: { document: "saved.txt" } })
    entry = await manager.install(new Program({ identity: "example", client: { location: client }, launch: { name: "declaration" } }))
    expect(await manager.launch(entry.program, "get")).toEqual({ options: { document: "saved.txt" } })
})

test("failed creation restores the exact previous saved launch", async context => {
    const { manager, definition } = fixture(context)
    const storage = definition().storage
    mkdirSync(join(storage, "permissions.json"), { recursive: true })
    const previous = '{ "options": { "document": "previous.txt" } }\n'
    writeFileSync(join(storage, "launch.json"), previous)
    await expect(manager.create({ ...definition(), launch: true })).rejects.toThrow()
    expect(manager.programs.size).toBe(0)
    expect(readFileSync(join(storage, "launch.json"), "utf8")).toBe(previous)
})

test("installing an attached Program uses the destination's stored permissions", async context => {
    const { manager, definition } = fixture(context)
    const program = await manager.create(definition({ all: true }))
    const sourceFile = join(program.storagePath, "permissions.json")
    const installedStorage = manager.fileManager.join("example", "storage")
    mkdirSync(installedStorage, { recursive: true })
    writeFileSync(join(installedStorage, "permissions.json"), JSON.stringify({ appearance: [] }))

    const installed = await manager.install(program)
    expect(installed.program.storagePath).toBe(installedStorage)
    expect(readPermissions(installed.program)).toEqual({ appearance: [] })
    expect(JSON.parse(readFileSync(sourceFile, "utf8"))).toEqual({ all: [] })
})
