import { TheLink } from "@the-link/core"
import { expect, test, vi } from "vitest"
import type AuthManager from "@server/core/link-manager/auth-manager/auth-manager"
import OpeningManager from "@server/core/opening-manager"

function fixture() {
    const program = (identity: string, opens: string[], installed = true) => [identity, { identity, installed, program: { identity, config: { opens } as { opens: string[] }, record: () => ({ identity }) } }] as const
    const stored = new Map<string, unknown>()
    const open = vi.fn(async () => "process")
    const programManager = Object.assign(new TheLink(), {
        programs: new Map([program("preview", ["image/*"]), program("paint", ["image/png"]), program("files", ["inode/directory"]), program("old", ["image/png"], false)]),
        open
    })
    const auth = Object.assign(new TheLink(), {
        linkManager: { application: { store: { get: async (key: string) => stored.get(key), set: async (key: string, value: unknown) => { stored.set(key, value) } } } },
        programManager,
        processManager: { announceHost: vi.fn(async () => undefined) }
    }) as unknown as AuthManager
    const announceHost = (auth as unknown as { processManager: { announceHost: ReturnType<typeof vi.fn> } }).processManager.announceHost
    const manager = new OpeningManager(auth)
    manager.followPrograms(programManager as never)
    // What a Program's update does: it opens other types, and the Program manager says it changed.
    async function update(identity: string, opens: string[]) {
        programManager.programs.get(identity)!.program.config.opens = opens
        await programManager.$outbound.publish("/install", { identity })
    }
    // The defaults announced, as [type, program or null].
    const announced = () => announceHost.mock.calls.filter(([, , event]) => event === "changeDefault").map(([, , , , type, record]) => [type, (record as { identity: string } | null)?.identity ?? null])
    return { manager, open, stored, announceHost, update, announced }
}

const png = { type: "image/png", uri: "file:///home/me/a.png" }

test("the Programs that open a type, wildcards included, attached ones as installed ones", () => {
    const { manager } = fixture()

    expect(manager.programsFor("image/png")).toEqual(["preview", "paint", "old"])
    expect(manager.programsFor("image/jpeg")).toEqual(["preview"])
    expect(manager.programsFor("text/plain")).toEqual([])
})

test("a malformed target is refused", async () => {
    const { manager } = fixture()

    await expect(manager.open({ type: "image/*", uri: "file:///a.png" }, null)).rejects.toThrow(/exact media type/)
    await expect(manager.open({ type: "image/png", uri: "not a uri" }, null)).rejects.toThrow(/URI/)
})

test("what nothing opens still reaches the owner, as a request with no Program to offer", async () => {
    const { manager, open, announceHost } = fixture()
    const text = { type: "text/plain", uri: "file:///a.txt" }

    await manager.open(text, null)

    const [request] = manager.requests()
    expect(request!.programs).toEqual([])
    expect(announceHost.mock.calls.some(([, , event]) => event === "request")).toBe(true)
    await manager.cancel(request!.identity)
    expect(open).not.toHaveBeenCalled()
    expect(manager.requests()).toEqual([])
})

test("a default Program opens it at once, with no request", async () => {
    const { manager, open, stored } = fixture()
    stored.set("opening-defaults", { "image/png": "paint" })

    await manager.open(png, null)

    expect(open).toHaveBeenCalledWith(expect.objectContaining({ identity: "paint" }), png, null)
    expect(manager.requests()).toEqual([])
})

test("a family's default opens every type in it, and an exact type's default wins over it", async () => {
    const { manager, open, stored } = fixture()
    stored.set("opening-defaults", { "image/*": "preview" })

    await manager.open({ type: "image/jpeg", uri: "file:///a.jpg" }, null)
    expect(open).toHaveBeenLastCalledWith(expect.objectContaining({ identity: "preview" }), { type: "image/jpeg", uri: "file:///a.jpg" }, null)

    stored.set("opening-defaults", { "image/*": "preview", "image/png": "paint" })
    await manager.open(png, null)
    expect(open).toHaveBeenLastCalledWith(expect.objectContaining({ identity: "paint" }), png, null)
    expect(manager.requests()).toEqual([])
})

test("a family's default needs a Program that opens all of it, and each change is announced once", async () => {
    const { manager, announceHost } = fixture()

    await expect(manager.setDefault("image/*", "paint")).rejects.toThrow(/does not open image\/\*/)
    await expect(manager.setDefault("*/*", "preview")).rejects.toThrow(/family/)

    await manager.setDefault("Image/*", "preview")
    await manager.setDefault("image/*", "preview")
    await manager.clearDefault("image/*")
    await manager.clearDefault("image/*")

    expect(announceHost.mock.calls.filter(([, , event]) => event === "changeDefault").map(([, , , , type, program]) => [type, program])).toEqual([
        ["image/*", { identity: "preview" }],
        ["image/*", null]
    ])
})

test("without a default, a request waits; choosing always opens it and makes the default", async () => {
    const { manager, open } = fixture()

    // The asker hands it over: it does not wait for the owner's choice.
    await manager.open(png, null)
    const [request] = manager.requests()

    // Offered as the Programs themselves, so whoever decides reads them as any Program.
    expect(request!.programs).toEqual([{ identity: "preview" }, { identity: "paint" }, { identity: "old" }])
    await expect(manager.choose(request!.identity, "files", {})).rejects.toThrow(/does not open this/)
    expect(manager.pending(request!.identity)).toBe(true)

    await manager.choose(request!.identity, "preview", { always: true })

    expect(open).toHaveBeenCalledWith(expect.objectContaining({ identity: "preview" }), png, null)
    expect(await manager.defaults()).toEqual({ "image/png": { identity: "preview" } })
    expect(manager.pending(request!.identity)).toBe(false)
})

test("the asker's position goes with the opening, even once a request is decided; without one, none", async () => {
    const { manager, open, stored } = fixture()
    const asker = { record: () => ({ identity: "asker" }), program: { record: () => ({ identity: "files" }) }, onClientStop: () => () => undefined, onServerStop: () => () => undefined } as never
    const beside = { x: 400, y: "-25% + 10" }
    stored.set("opening-defaults", { "image/png": "paint" })

    await manager.open(png, { process: asker, endpoint: "client" }, { position: beside })
    expect(open).toHaveBeenLastCalledWith(expect.objectContaining({ identity: "paint" }), png, beside)

    await manager.open(png, { process: asker, endpoint: "client" })
    expect(open).toHaveBeenLastCalledWith(expect.objectContaining({ identity: "paint" }), png, null)

    await expect(manager.open(png, null, { position: { x: "beside", y: 0 } })).rejects.toThrow(/relative expression/)

    stored.clear()
    await manager.open(png, { process: asker, endpoint: "server" }, { position: beside })
    await manager.choose(manager.requests()[0]!.identity, "preview", {})
    expect(open).toHaveBeenLastCalledWith(expect.objectContaining({ identity: "preview" }), png, beside)
})

test("a cancelled request opens nothing", async () => {
    const { manager, open } = fixture()

    await manager.open(png, null)
    await manager.cancel(manager.requests()[0]!.identity)

    expect(open).not.toHaveBeenCalled()
    expect(manager.requests()).toEqual([])
})

test("purging a Program forgets every default naming it, each announced as cleared", async () => {
    const { manager, stored, announced } = fixture()
    await manager.setDefault("image/png", "paint")
    await manager.setDefault("image/*", "preview")

    await manager.forgetProgram("paint")
    await manager.forgetProgram("paint")

    expect(stored.get("opening-defaults")).toEqual({ "image/*": "preview" })
    expect(announced()).toEqual([["image/png", "paint"], ["image/*", "preview"], ["image/png", null]])
})

test("a default counts only while its Program opens the type, and counts again once it does", async () => {
    const { manager, stored, update, announced, open } = fixture()
    await manager.setDefault("image/png", "paint")

    await update("paint", ["image/gif"])

    // Still chosen, yet left out: the owner is asked, as if none was chosen.
    expect(stored.get("opening-defaults")).toEqual({ "image/png": "paint" })
    expect(await manager.defaults()).toEqual({})
    await manager.open(png, null)
    expect(open).not.toHaveBeenCalled()
    expect(manager.requests()).toHaveLength(1)

    await update("paint", ["image/png"])

    expect(Object.keys(await manager.defaults())).toEqual(["image/png"])
    expect(announced()).toEqual([["image/png", "paint"], ["image/png", null], ["image/png", "paint"]])
})

test("a default whose Program is no longer known is left out", async () => {
    const { manager, stored } = fixture()
    stored.set("opening-defaults", { "image/png": "gone", "inode/directory": "files" })

    expect(await manager.defaults()).toEqual({ "inode/directory": { identity: "files" } })
})

test("a default must be a Program that opens that type", async () => {
    const { manager } = fixture()

    await expect(manager.setDefault("image/png", "files")).rejects.toThrow(/does not open image\/png/)
    await manager.setDefault("image/png", "paint")
    await manager.clearDefault("image/png")
    expect(await manager.defaults()).toEqual({})
})

test("a request stays the owner's after the one who asked is gone", async () => {
    const { manager } = fixture()
    const asker = { record: () => ({ identity: "asker" }), program: { record: () => ({ identity: "files" }) } } as never

    await manager.open(png, { process: asker, endpoint: "client" })

    expect(manager.requests()).toHaveLength(1)
})
