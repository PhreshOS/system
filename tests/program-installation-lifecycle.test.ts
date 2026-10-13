import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { TheLink } from "@the-link/core"
import { expect, test, vi, type TestContext } from "vitest"
import type { Launch } from "@phreshos/core"
import FileManager from "@libs/file-manager"
import type AuthManager from "@server/core/link-manager/auth-manager/auth-manager"
import Program from "@server/core/link-manager/auth-manager/program-manager/program"
import ProgramManager from "@server/core/link-manager/auth-manager/program-manager/program-manager"
import ProgramStateStorage from "@server/core/link-manager/auth-manager/program-manager/state"

function fixture(context: TestContext) {
    const directory = mkdtempSync(join(tmpdir(), "phresh-install-lifecycle-"))
    context.onTestFinished(() => { vi.restoreAllMocks(); rmSync(directory, { recursive: true, force: true }) })
    const server = join(directory, "source", "server")
    mkdirSync(server, { recursive: true })
    const exitAll = vi.fn()
    const announceHost = vi.fn()
    const announceSubject = vi.fn(async (..._values: unknown[]) => undefined)
    const forgetProgram = vi.fn(async (_program: string) => undefined)
    const auth = Object.assign(new TheLink(), {
        linkManager: { application: { storage: new FileManager(directory, "system"), icons: { system: "", defaultProgram: "" } } },
        processManager: { processes: new Map(), exitAll, announceHost, announceSubject, requireLaunch: vi.fn() },
        openingManager: { forgetProgram }
    }) as unknown as AuthManager
    const manager = new ProgramManager(auth)
    const definition = (installCommand = `node -e "process.stdout.write('preparing')"`, installLaunch?: true | Launch) => new Program({
        identity: "example", storage: join(directory, "source", "storage"),
        installLaunch,
        server: { location: server, installCommand, command: "node main.js" }
    })
    return { directory, manager, exitAll, announceHost, announceSubject, forgetProgram, definition }
}

test("installation output precedes Process exit and handle switch; an explicit launch overrides the definition", async context => {
    const { manager, exitAll, definition } = fixture(context)
    const source = definition()
    const old = await manager.create({ ...source.config, storage: source.storagePath } as import("@phreshos/core").ProgramDefinition)
    const oldRoot = old.root
    const events: string[] = []
    const original = old.replace.bind(old)
    vi.spyOn(old, "replace").mockImplementation(next => { events.push("switch"); original(next) })
    exitAll.mockImplementation(async () => { events.push("exit"); expect(old.root).toBe(oldRoot) })
    vi.spyOn(manager as unknown as { start(program: Program, launch: Launch): Promise<string> }, "start")
        .mockImplementation(async (program, launch) => {
            expect(program).toBe(old)
            expect(program.root).not.toBe(oldRoot)
            events.push(launch.name!)
            return launch.name!
        })
    const result = await manager.install(old, { launch: { name: "explicit" } }, "self", chunk => {
        expect(chunk.text).toBe("preparing")
        expect(exitAll).not.toHaveBeenCalled()
        expect(old.root).toBe(oldRoot)
        events.push("output")
    })
    expect(result.program).toBe(old)
    expect(events).toEqual(["output", "exit", "switch", "explicit"])
    expect(exitAll).toHaveBeenCalledWith("example", "self")
})

test("failed preparation leaves the handle and its Processes intact", async context => {
    const { manager, exitAll, definition } = fixture(context)
    const source = definition(`node -e "process.exit(1)"`)
    const old = await manager.create({ ...source.config, storage: source.storagePath } as import("@phreshos/core").ProgramDefinition)
    const root = old.root
    await expect(manager.install(old, { launch: true })).rejects.toThrow("exited with 1")
    expect(exitAll).not.toHaveBeenCalled()
    expect(old.root).toBe(root)
})

test("System completes the requested launch after the installation output consumer detaches", async context => {
    const { manager, definition } = fixture(context)
    const start = vi.spyOn(manager as unknown as { start(program: Program, launch: Launch): Promise<string> }, "start").mockResolvedValue("process")
    const install = manager.install.bind(manager)
    let completion: ReturnType<typeof install> | undefined
    vi.spyOn(manager, "install").mockImplementation((...args) => completion = install(...args))
    const stream = manager.installStreaming(definition(), { launch: { name: "explicit" } })
    expect((await stream.next()).value).toEqual({ stream: "stdout", text: "preparing" })
    await stream.return(undefined as never)
    await completion
    expect(start.mock.calls.map(([, launch]) => launch.name)).toEqual(["explicit"])
    expect(manager.find("example").installed).toBe(true)
})

test("purge resets installed storage before launching and preserves source storage", async context => {
    const { directory, manager, definition } = fixture(context)
    const start = vi.spyOn(manager as unknown as { start(program: Program, launch: Launch): Promise<string> }, "start").mockResolvedValue("process")
    let entry = await manager.install(definition())
    const installedNote = join(entry.program.storagePath, "note.txt")
    mkdirSync(entry.program.storagePath, { recursive: true })
    writeFileSync(installedNote, "installed data")
    const pinnedAt = await manager.pinned(entry.program, "pin")
    const sourceStorage = join(directory, "source", "storage")
    mkdirSync(sourceStorage, { recursive: true })
    writeFileSync(join(sourceStorage, "note.txt"), "development data")
    const installedAt = entry.installedAt
    entry = await manager.install(definition())
    expect(readFileSync(installedNote, "utf8")).toBe("installed data")
    expect(await manager.pinned(entry.program, "get")).toBe(pinnedAt)
    // Installing over the data it kept keeps the time it was first installed.
    expect(entry.installedAt).toBe(installedAt)
    start.mockImplementation(async program => {
        expect(existsSync(join(program.storagePath, "note.txt"))).toBe(false)
        return "process"
    })
    entry = await manager.install(definition(), { purge: true, launch: true })
    expect(existsSync(installedNote)).toBe(false)
    expect(await manager.pinned(entry.program, "get")).toBeNull()
    // Purged, it starts a new time.
    expect(entry.installedAt).not.toBe(installedAt)
    expect(readFileSync(join(sourceStorage, "note.txt"), "utf8")).toBe("development data")
})

test("an omitted installation launch uses installLaunch and false disables it", async context => {
    const { manager, definition } = fixture(context)
    const start = vi.spyOn(manager as unknown as { start(program: Program, launch: Launch): Promise<string> }, "start").mockResolvedValue("process")

    await manager.install(definition(undefined, { name: "welcome" }))
    await manager.install(definition(undefined, { name: "ignored" }), { launch: false })

    expect(start.mock.calls.map(([, launch]) => launch.name)).toEqual(["welcome"])
})

test("a reinstall starts the Program's startup launch again, as the System does when it starts", async context => {
    const { manager, definition } = fixture(context)
    const start = vi.spyOn(manager as unknown as { start(program: Program, launch: Launch, watching?: unknown, parent?: unknown, transitionOwnsIdentity?: boolean): Promise<string> }, "start").mockResolvedValue("process")

    const first = await manager.install(definition())
    await manager.startup(first.program, "set", { name: "panel" })
    await manager.install(definition())

    // The first install had no startup launch; the reinstall ended the Processes and starts that one again.
    expect(start.mock.calls.map(([, launch]) => launch.name)).toEqual(["panel"])
    // Still inside the reinstall, which owns the Program's identity until it returns.
    expect(start.mock.calls[0]?.[4]).toBe(true)
})

test("a reinstall whose startup already started the install launch's named Process keeps that one", async context => {
    const { manager, definition, exitAll } = fixture(context)
    const processes = manager.authManager.processManager.processes as unknown as Map<string, { program: Program, name: string | null }>
    // Starting adds the Process; ending every Process of the Program, as a reinstall does, removes them.
    const start = vi.spyOn(manager as unknown as { start(program: Program, launch: Launch): Promise<string> }, "start")
        .mockImplementation(async (program, launch) => { processes.set(String(launch.name), { program, name: launch.name ?? null }); return String(launch.name) })
    exitAll.mockImplementation(async () => processes.clear())
    const server = { name: "files", server: true, client: false } as const

    const first = await manager.install(definition(undefined, server))
    await manager.startup(first.program, "set", server)
    // The startup starts "files" again; the install launch finds it running and is done.
    await expect(manager.install(definition(undefined, server))).resolves.toBeDefined()
    expect(start.mock.calls.map(([, launch]) => launch.name)).toEqual(["files", "files"])

    // An install launch that asks to replace it still starts its own.
    await manager.install(definition(undefined, { ...server, replace: true }))
    expect(start.mock.calls.map(([, launch]) => launch.name)).toEqual(["files", "files", "files", "files"])
})

test("explicit launch errors propagate without rolling back the installed Program", async context => {
    const { manager, definition } = fixture(context)
    const start = vi.spyOn(manager as unknown as { start(program: Program, launch: Launch): Promise<string> }, "start")
        .mockRejectedValue(new Error("launch failed"))
    await expect(manager.install(definition(), { launch: true })).rejects.toThrow("launch failed")
    expect(manager.find("example").installed).toBe(true)
    expect(start).toHaveBeenCalledTimes(1)
})

test("uninstalling ends the Program's Processes and forgets its handle; its data stays for the next install", async context => {
    const { manager, forgetProgram, exitAll, announceHost, definition } = fixture(context)
    const entry = await manager.install(definition())
    const program = entry.program
    const home = manager.fileManager.join(program.identity)
    const installedAt = entry.installedAt
    const pinnedAt = await manager.pinned(program, "pin")
    expect(installedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    await manager.uninstall(program)

    // The handle ended, as an exited Process's does.
    expect(manager.programs.has(program.identity)).toBe(false)
    expect(exitAll).toHaveBeenCalledExactlyOnceWith(program.identity, null)
    expect(announceHost.mock.calls.filter(([, , event]) => event === "uninstall")).toHaveLength(1)
    expect(announceHost.mock.calls.filter(([, , event]) => event === "forget")).toHaveLength(1)
    await expect(manager.uninstall(program)).rejects.toThrow("does not know this program")
    // Its data stayed, and what the System keeps naming it.
    expect(existsSync(join(program.storagePath, "state.json"))).toBe(true)
    expect(forgetProgram).not.toHaveBeenCalled()

    // Installed again: a new handle, which finds the time it was first installed and its pin.
    const again = await manager.install(definition())
    expect(again.program.reference).not.toBe(program.reference)
    expect(again.installedAt).toBe(installedAt)
    expect(await manager.pinned(again.program, "get")).toBe(pinnedAt)

    await manager.uninstall(again.program, { purge: true })

    // Purged, nothing in the System says it was here.
    expect(manager.programs.has(program.identity)).toBe(false)
    expect(existsSync(home)).toBe(false)
    expect(forgetProgram).toHaveBeenCalledExactlyOnceWith(program.identity)
})

test("clearing storage ends the Program's Processes and empties what it keeps, keeping the owner's decisions and its logs", async context => {
    const { manager, exitAll, definition } = fixture(context)
    const entry = await manager.install(definition())
    const program = entry.program
    const address = { identity: program.identity, reference: program.reference }
    const storage = program.storagePath
    mkdirSync(join(storage, "data"), { recursive: true })
    writeFileSync(join(storage, "data", "note.txt"), "kept")
    mkdirSync(join(storage, "cache"), { recursive: true })
    writeFileSync(join(storage, "cache", "thumbnail.bin"), "1234")
    await manager.store(address, "set", "draft", "hello")
    manager.databaseOf(program).query("CREATE TABLE notes (title TEXT)")
    manager.logsOf(program).record("process", "server", "note", "it said something")
    const pinnedAt = await manager.pinned(program, "pin")
    const before = manager.storageSize(program)
    expect(before).toBeGreaterThan(8)

    await manager.clearStorage(program)

    expect(exitAll).toHaveBeenCalledWith(program.identity, null)
    expect(existsSync(join(storage, "data"))).toBe(false)
    expect(existsSync(join(storage, "cache"))).toBe(false)
    expect(existsSync(join(storage, "database.sqlite"))).toBe(false)
    expect(await manager.store(address, "get", "draft")).toBeUndefined()
    // What the owner decided, when it was installed, and what it said stay.
    expect(await manager.pinned(program, "get")).toBe(pinnedAt)
    expect(manager.installedAt(program)).toBe(entry.installedAt)
    expect(existsSync(join(storage, "logs.sqlite"))).toBe(true)
    expect(manager.storageSize(program)).toBeLessThan(before)
    // Its database opens again, empty.
    expect(() => manager.databaseOf(program).query("CREATE TABLE notes (title TEXT)")).not.toThrow()

    // Forgetting it closes what it holds open, which Windows needs before the folder can go.
    await manager.forget(program)
})

test("startup and pinned state share one file without overwriting each other", async context => {
    const { manager, definition } = fixture(context)
    vi.spyOn(manager as unknown as { start(): Promise<string> }, "start").mockResolvedValue("process")
    const { program } = await manager.install(definition())
    const startup = { name: "background", options: { mode: "quiet" } }

    await manager.startup(program, "set", startup)
    const pinnedAt = await manager.pinned(program, "pin")
    await manager.setPermission(program, "network", false)

    expect(await manager.startup(program, "get")).toEqual(startup)
    expect(pinnedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(await manager.pinned(program, "get")).toBe(pinnedAt)
    expect(new ProgramStateStorage(program).permissions()).toEqual({ network: false })
    expect(JSON.parse(readFileSync(join(program.storagePath, "state.json"), "utf8"))).toEqual({
        installedAt: expect.any(String),
        startup,
        pinnedAt,
        permissions: { network: false }
    })

    await manager.startup(program, "remove")
    await manager.pinned(program, "unpin")
    expect(await manager.startup(program, "get")).toBeNull()
    expect(await manager.pinned(program, "get")).toBeNull()
    expect(new ProgramStateStorage(program).permissions()).toEqual({ network: false })
})

test("Program state mutations do not rewrite an already-satisfied value", async context => {
    const { manager, definition } = fixture(context)
    vi.spyOn(manager as unknown as { start(): Promise<string> }, "start").mockResolvedValue("process")
    const { program } = await manager.install(definition())
    const startupWrite = vi.spyOn(ProgramStateStorage.prototype, "setStartup")
    const permissionWrite = vi.spyOn(ProgramStateStorage.prototype, "setPermission")
    context.onTestFinished(() => { startupWrite.mockRestore(); permissionWrite.mockRestore() })

    await manager.startup(program, "set", { name: "background" })
    await manager.startup(program, "set", { name: "background" })
    await manager.setPermission(program, "network", false)
    await manager.setPermission(program, "network", false)
    await manager.startup(program, "remove")
    await manager.startup(program, "remove")

    expect(startupWrite).toHaveBeenCalledTimes(2)
    expect(permissionWrite).toHaveBeenCalledTimes(1)
})

test("startup changes emit Program and global events, and filter the Program list", async context => {
    const { manager, definition, announceHost, announceSubject } = fixture(context)
    vi.spyOn(manager as unknown as { start(): Promise<string> }, "start").mockResolvedValue("process")
    const { program } = await manager.install(definition())
    const records: unknown[][] = []
    const stop = manager.$outbound.subscribe("/startup-change", (record, launch) => { records.push([record, launch]) })
    context.onTestFinished(stop)
    announceHost.mockClear()
    announceSubject.mockClear()

    await manager.startup(program, "set", { name: "background" })
    await manager.startup(program, "set", { name: "background" })
    expect(manager.find(program.identity).record().startup).toBe(true)
    await manager.startup(program, "remove")
    await manager.startup(program, "remove")
    expect(manager.find(program.identity).record().startup).toBe(false)

    expect(announceHost.mock.calls.map(([, owner, event, , , launch]) => [owner, event, launch])).toEqual([
        [program.identity, "changeStartup", { name: "background" }],
        [program.identity, "changeStartup", null]
    ])
    expect(announceSubject.mock.calls.map(([, , event, subject, launch]) => [event, subject, launch])).toEqual([
        ["changeStartup", program.reference, { name: "background" }],
        ["changeStartup", program.reference, null]
    ])
    expect(records.map(([record, launch]) => [(record as { startup: boolean }).startup, launch])).toEqual([
        [true, { name: "background" }],
        [false, null]
    ])
})
