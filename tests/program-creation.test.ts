import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { TheLink } from "@the-link/core"
import { expect, test, vi, type TestContext } from "vitest"
import type { ProgramPermissionDeclarations } from "@phreshos/core"
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
    function definition(permissions?: ProgramPermissionDeclarations) {
        return { identity: "example", storage: join(directory, "data"), permissions, client: { location: client } }
    }
    return { directory, client, manager, announceHost, definition }
}

test("creation establishes all declared settings before announcing the Program", async context => {
    const { manager, definition, announceHost } = fixture(context)
    announceHost.mockImplementation((_domain, event, _identity, entry) => {
        if (event === "create") {
            expect(readPermissions(entry.program)).toEqual({ network: ["https://api.example.test"], uploads: [] })
            expect(JSON.parse(readFileSync(join(entry.program.storagePath, "startup.json"), "utf8"))).toEqual({})
            expect(JSON.parse(readFileSync(join(entry.program.storagePath, "launch.json"), "utf8"))).toEqual({ name: "icon" })
        }
    })
    const program = await manager.create({
        ...definition({ network: ["https://api.example.test/**"], uploads: true }),
        startup: true, launch: { name: "icon" }
    })
    expect(manager.find(program.identity).installed).toBe(false)
    expect(JSON.parse(readFileSync(join(program.storagePath, "permissions.json"), "utf8"))).toEqual({ network: ["https://api.example.test"], uploads: [] })
    expect(announceHost).toHaveBeenCalledOnce()
})

test("creation and force-create apply declared permissions without changing unrelated entries", async context => {
    const { manager, definition } = fixture(context)
    const first = await manager.create(definition({ all: true }))
    writePermissions(first, { appearance: [], network: [] })
    const replacement = await manager.forceCreate(definition({ network: ["https://api.example.test"], services: ["example"] }))
    expect(readPermissions(replacement)).toEqual({ appearance: [], network: ["https://api.example.test"], services: ["example"] })
    await manager.forget(replacement)
    const empty = await manager.create(definition())
    expect(readPermissions(empty)).toEqual({ appearance: [], network: ["https://api.example.test"], services: ["example"] })
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
    await expect(manager.create({ ...definition({ appearance: true }), storage })).rejects.toThrow()
    expect(manager.programs.size).toBe(0)
    expect(announceHost).not.toHaveBeenCalled()
    expect(readFileSync(storage, "utf8")).toBe("keep this")
})

test("boot reconstruction preserves all stored settings and launches the saved startup", async context => {
    const { manager, definition, client } = fixture(context)
    const directory = manager.fileManager.join("example")
    mkdirSync(directory)
    writeFileSync(join(directory, "program.json"), JSON.stringify({ ...definition({ all: true }), startup: true, launch: true, storage: "storage", client: { location: client } }))
    mkdirSync(join(directory, "storage"))
    writeFileSync(join(directory, "storage", "permissions.json"), JSON.stringify({ network: false }))
    writeFileSync(join(directory, "storage", "launch.json"), JSON.stringify({ options: { document: "saved.txt" } }))
    const startup = { name: "saved-startup" }
    writeFileSync(join(directory, "storage", "startup.json"), JSON.stringify(startup))
    const start = vi.spyOn(manager as unknown as { start(program: Program, launch: unknown): Promise<string> }, "start").mockResolvedValue("process")
    await manager.initialize()
    expect(readPermissions(manager.find("example").program)).toEqual({ network: false })
    expect(await manager.launch(manager.find("example").program, "get")).toEqual({ options: { document: "saved.txt" } })
    expect(await manager.startup(manager.find("example").program, "get")).toEqual(startup)
    expect(start).toHaveBeenCalledExactlyOnceWith(manager.find("example").program, startup)
})

test("creation applies explicit launch decisions and preserves omitted ones", async context => {
    const { manager, definition } = fixture(context)
    const intent = { client: { layer: "over" as const }, options: { document: "icon.txt" } }
    let program = await manager.create({ ...definition(), launch: intent, startup: intent })
    expect(await manager.launch(program, "get")).toEqual(intent)
    expect(await manager.startup(program, "get")).toEqual(intent)
    expect(manager.authManager.processManager.processes.size).toBe(0)
    program = await manager.forceCreate(definition())
    expect(await manager.launch(program, "get")).toEqual(intent)
    expect(await manager.startup(program, "get")).toEqual(intent)
    for (const value of [true, {}] as const) {
        await manager.launch(program, "set", intent)
        await manager.startup(program, "enable", intent)
        program = await manager.forceCreate({ ...definition(), launch: value, startup: value })
        expect(await manager.launch(program, "get")).toEqual({})
        expect(await manager.startup(program, "get")).toEqual({})
    }
    expect(manager.authManager.processManager.processes.size).toBe(0)
})

test("undefined launch decisions leave existing bytes and absent files untouched", async context => {
    const { manager, definition } = fixture(context)
    let program = await manager.create({ ...definition(), startup: undefined, launch: undefined })
    for (const name of ["startup", "launch"]) {
        expect(existsSync(join(program.storagePath, `${name}.json`))).toBe(false)
    }
    const previous = '{ "name": "saved" }\n'
    mkdirSync(program.storagePath, { recursive: true })
    for (const name of ["startup", "launch"]) writeFileSync(join(program.storagePath, `${name}.json`), previous)
    await manager.forget(program)
    program = await manager.create({ ...definition(), startup: undefined, launch: undefined })
    for (const name of ["startup", "launch"]) {
        expect(readFileSync(join(program.storagePath, `${name}.json`), "utf8")).toBe(previous)
    }
    expect(readPermissions(program)).toEqual({})
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
    await expect(manager.forceCreate({ ...definition(), startup: { server: true } })).rejects.toThrow("no server")
    expect(manager.find("example").program).toBe(program)
    expect(await manager.launch(program, "get")).toEqual({ options: { document: "saved.txt" } })
})

test("installation applies saved launch decisions and preserves omitted ones", async context => {
    const { manager, client } = fixture(context)
    let entry = await manager.install(new Program({ identity: "example", client: { location: client }, launch: true }))
    expect(await manager.launch(entry.program, "get")).toEqual({})
    await manager.launch(entry.program, "set", { options: { document: "saved.txt" } })
    entry = await manager.install(new Program({ identity: "example", client: { location: client } }))
    expect(await manager.launch(entry.program, "get")).toEqual({ options: { document: "saved.txt" } })
    entry = await manager.install(new Program({ identity: "example", client: { location: client }, launch: { name: "declaration" } }))
    expect(await manager.launch(entry.program, "get")).toEqual({ name: "declaration" })
})

test("failed creation restores both exact previous launch files", async context => {
    const { manager, definition } = fixture(context)
    const storage = definition().storage
    mkdirSync(join(storage, "permissions.json"), { recursive: true })
    const previous = '{ "options": { "document": "previous.txt" } }\n'
    writeFileSync(join(storage, "launch.json"), previous)
    writeFileSync(join(storage, "startup.json"), previous)
    await expect(manager.create({ ...definition({ appearance: true }), startup: true, launch: true })).rejects.toThrow()
    expect(manager.programs.size).toBe(0)
    expect(readFileSync(join(storage, "launch.json"), "utf8")).toBe(previous)
    expect(readFileSync(join(storage, "startup.json"), "utf8")).toBe(previous)
})

test("a failed icon launch replacement rolls back startup before any announcement", async context => {
    const { manager, definition, announceHost } = fixture(context)
    const storage = definition().storage
    mkdirSync(join(storage, "launch.json"), { recursive: true })
    const previous = '{ "name": "previous-startup" }\n'
    writeFileSync(join(storage, "startup.json"), previous)
    await expect(manager.create({ ...definition(), startup: true, launch: true })).rejects.toThrow()
    expect(readFileSync(join(storage, "startup.json"), "utf8")).toBe(previous)
    expect(existsSync(join(storage, "permissions.json"))).toBe(false)
    expect(manager.programs.size).toBe(0)
    expect(announceHost).not.toHaveBeenCalled()
})

test("uninstalled Programs support startup and launch operations without creating Processes", async context => {
    const { manager, definition } = fixture(context)
    const program = await manager.create(definition())
    expect(manager.find(program.identity).installed).toBe(false)
    await manager.startup(program, "enable")
    expect(await manager.startup(program, "get")).toEqual({})
    const intent = { name: "saved", options: { document: "file.txt" } }
    await manager.startup(program, "enable", intent)
    await manager.launch(program, "set", intent)
    expect(await manager.startup(program, "get")).toEqual(intent)
    expect(await manager.launch(program, "get")).toEqual(intent)
    await expect(manager.startup(program, "enable", { server: true })).rejects.toThrow("no server")
    expect(await manager.startup(program, "get")).toEqual(intent)
    await manager.startup(program, "disable")
    expect(await manager.startup(program, "get")).toBeNull()
    expect(manager.authManager.processManager.processes.size).toBe(0)
})

test("installing an attached Program applies declarations to destination permissions", async context => {
    const { manager, definition } = fixture(context)
    const program = await manager.create(definition({ all: true }))
    const sourceFile = join(program.storagePath, "permissions.json")
    const installedStorage = manager.fileManager.join("example", "storage")
    mkdirSync(installedStorage, { recursive: true })
    writeFileSync(join(installedStorage, "permissions.json"), JSON.stringify({ appearance: [] }))

    const installed = await manager.install(program)
    expect(installed.program.storagePath).toBe(installedStorage)
    expect(readPermissions(installed.program)).toEqual({ appearance: [], all: [] })
    expect(JSON.parse(readFileSync(sourceFile, "utf8"))).toEqual({ all: [] })
})

test("a fresh installation receives the declared permission in destination storage", async context => {
    const { manager, definition } = fixture(context)
    const program = await manager.create(definition({ appearance: true }))
    const sourceStorage = program.storagePath
    expect(readPermissions(program)).toEqual({ appearance: [] })
    expect(manager.allowsPermission(program, "appearance")).toBe(true)
    await manager.install(program)
    expect(program.storagePath).not.toBe(sourceStorage)
    expect(existsSync(join(program.storagePath, "permissions.json"))).toBe(true)
    expect(readPermissions(program)).toEqual({ appearance: [] })
    expect(manager.allowsPermission(program, "appearance")).toBe(true)
})

test("empty permission declarations neither create nor touch permission files", async context => {
    const { manager, definition } = fixture(context)
    for (const permissions of [undefined, {}]) {
        let program = await manager.forceCreate(definition(permissions))
        const sourceFile = join(program.storagePath, "permissions.json")
        expect(existsSync(sourceFile)).toBe(false)
        await manager.install(program)
        const destinationFile = join(program.storagePath, "permissions.json")
        expect(existsSync(destinationFile)).toBe(false)
        // Even unreadable stored contents must not be read or rewritten by an empty decision.
        mkdirSync(program.storagePath, { recursive: true })
        writeFileSync(destinationFile, "untouched destination")
        await manager.install(program)
        expect(readFileSync(destinationFile, "utf8")).toBe("untouched destination")
        rmSync(destinationFile)
        mkdirSync(definition().storage, { recursive: true })
        writeFileSync(sourceFile, "untouched source")
        program = await manager.forceCreate(definition(permissions))
        expect(readFileSync(sourceFile, "utf8")).toBe("untouched source")
        rmSync(sourceFile)
    }
})

for (const previous of [false, true]) test(`failed installation rolls back declaration settings (previous files: ${previous})`, async context => {
    const { manager, client } = fixture(context)
    const original = new Program({ identity: "example", client: { location: client } })
    const entry = await manager.install(original)
    const storage = entry.program.storagePath
    mkdirSync(storage, { recursive: true })
    const files = {
        permissions: '{ "uploads": [], "network": false }\n',
        startup: '{ "name": "previous-startup" }\n',
        launch: '{ "name": "previous-launch" }\n'
    }
    if (previous) for (const [name, bytes] of Object.entries(files)) writeFileSync(join(storage, `${name}.json`), bytes)
    const declaration = readFileSync(join(entry.program.root, "program.json"), "utf8")
    const replacement = vi.spyOn(entry.program, "replace").mockImplementationOnce(() => { throw new Error("registration failed") })
    try {
        await expect(manager.install(new Program({
            identity: "example", startup: true, launch: true, permissions: { network: true },
            client: { location: client }
        }))).rejects.toThrow("registration failed")
    }
    finally { replacement.mockRestore() }
    for (const [name, bytes] of Object.entries(files)) {
        const path = join(storage, `${name}.json`)
        if (previous) expect(readFileSync(path, "utf8")).toBe(bytes)
        else expect(existsSync(path)).toBe(false)
    }
    expect(readFileSync(join(entry.program.root, "program.json"), "utf8")).toBe(declaration)
})
