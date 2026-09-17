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

function fixture(context: TestContext) {
    const directory = mkdtempSync(join(tmpdir(), "phresh-install-lifecycle-"))
    context.onTestFinished(() => { vi.restoreAllMocks(); rmSync(directory, { recursive: true, force: true }) })
    const server = join(directory, "source", "server")
    mkdirSync(server, { recursive: true })
    const exitAll = vi.fn()
    const auth = Object.assign(new TheLink(), {
        linkManager: { application: { storage: new FileManager(directory, "system"), defaultProgramIcon: "" } },
        processManager: { processes: new Map(), exitAll, announceHost: vi.fn(), announceSubject: vi.fn() }
    }) as unknown as AuthManager
    const manager = new ProgramManager(auth)
    const definition = (installCommand = `node -e "process.stdout.write('preparing')"`) => new Program({
        identity: "example", storage: join(directory, "source", "storage"),
        startup: { name: "startup" },
        server: { location: server, installCommand, command: "node main.js" }
    })
    return { directory, manager, exitAll, definition }
}

test("installation output precedes Process exit and handle switch; explicit launch precedes startup", async context => {
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
    expect(events).toEqual(["output", "exit", "switch", "explicit", "startup"])
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
    expect(start.mock.calls.map(([, launch]) => launch.name)).toEqual(["explicit", "startup"])
    expect(manager.find("example").installed).toBe(true)
})

test("purge resets installed storage before launching and preserves source storage", async context => {
    const { directory, manager, definition } = fixture(context)
    const start = vi.spyOn(manager as unknown as { start(program: Program, launch: Launch): Promise<string> }, "start").mockResolvedValue("process")
    let entry = await manager.install(definition())
    const installedNote = join(entry.program.storagePath, "note.txt")
    writeFileSync(installedNote, "installed data")
    const sourceStorage = join(directory, "source", "storage")
    mkdirSync(sourceStorage, { recursive: true })
    writeFileSync(join(sourceStorage, "note.txt"), "development data")
    entry = await manager.install(definition())
    expect(readFileSync(installedNote, "utf8")).toBe("installed data")
    start.mockImplementation(async program => {
        expect(existsSync(join(program.storagePath, "note.txt"))).toBe(false)
        return "process"
    })
    entry = await manager.install(definition(), { purge: true, launch: true })
    expect(existsSync(installedNote)).toBe(false)
    expect(readFileSync(join(sourceStorage, "note.txt"), "utf8")).toBe("development data")
    expect(JSON.parse(readFileSync(join(entry.program.storagePath, "startup.json"), "utf8"))).toEqual({ name: "startup" })
})

test("explicit launch errors propagate without rolling back the installed Program", async context => {
    const { manager, definition } = fixture(context)
    const start = vi.spyOn(manager as unknown as { start(program: Program, launch: Launch): Promise<string> }, "start")
        .mockRejectedValue(new Error("launch failed"))
    await expect(manager.install(definition(), { launch: true })).rejects.toThrow("launch failed")
    expect(manager.find("example").installed).toBe(true)
    expect(start).toHaveBeenCalledTimes(1)
})
