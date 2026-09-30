import { TheLink } from "@the-link/core"
import { expect, test, vi } from "vitest"
import type AuthManager from "@server/core/link-manager/auth-manager/auth-manager"
import OpeningManager from "@server/core/opening-manager"

function fixture() {
    const program = (identity: string, opens: string[], installed = true) => [identity, { identity, installed, program: { identity, config: { opens }, record: () => ({ identity }) } }] as const
    const stored = new Map<string, unknown>()
    const open = vi.fn(async () => "process")
    const auth = Object.assign(new TheLink(), {
        linkManager: { application: { store: { get: async (key: string) => stored.get(key), set: async (key: string, value: unknown) => { stored.set(key, value) } } } },
        programManager: {
            programs: new Map([program("preview", ["image/*"]), program("paint", ["image/png"]), program("files", ["inode/directory"]), program("old", ["image/png"], false)]),
            open
        },
        processManager: { announceHost: vi.fn(async () => undefined) }
    }) as unknown as AuthManager
    return { manager: new OpeningManager(auth), open, stored }
}

const png = { type: "image/png", uri: "file:///home/me/a.png" }

test("the installed Programs that open a type, wildcards included", () => {
    const { manager } = fixture()

    expect(manager.programsFor("image/png")).toEqual(["preview", "paint"])
    expect(manager.programsFor("image/jpeg")).toEqual(["preview"])
    expect(manager.programsFor("text/plain")).toEqual([])
})

test("nothing to open with, or a malformed target, is refused", async () => {
    const { manager } = fixture()

    await expect(manager.open({ type: "text/plain", uri: "file:///a.txt" }, null)).rejects.toThrow(/No Program opens text\/plain/)
    await expect(manager.open({ type: "image/*", uri: "file:///a.png" }, null)).rejects.toThrow(/exact media type/)
    await expect(manager.open({ type: "image/png", uri: "not a uri" }, null)).rejects.toThrow(/URI/)
})

test("a default Program opens it at once, with no request", async () => {
    const { manager, open, stored } = fixture()
    stored.set("opening-defaults", { "image/png": "paint" })

    await manager.open(png, null)

    expect(open).toHaveBeenCalledWith(expect.objectContaining({ identity: "paint" }), png)
    expect(manager.requests()).toEqual([])
})

test("without a default, a request waits; choosing always opens it and makes the default", async () => {
    const { manager, open } = fixture()

    const opening = manager.open(png, null)
    await vi.waitFor(() => expect(manager.requests()).toHaveLength(1))
    const [request] = manager.requests()

    // Offered as the Programs themselves, so whoever decides reads them as any Program.
    expect(request!.programs).toEqual([{ identity: "preview" }, { identity: "paint" }])
    await expect(manager.choose(request!.identity, "files", {})).rejects.toThrow(/does not open this/)
    expect(manager.pending(request!.identity)).toBe(true)

    await manager.choose(request!.identity, "preview", { always: true })
    await opening

    expect(open).toHaveBeenCalledWith(expect.objectContaining({ identity: "preview" }), png)
    expect(await manager.defaults()).toEqual({ "image/png": { identity: "preview" } })
    expect(manager.pending(request!.identity)).toBe(false)
})

test("a cancelled request opens nothing and tells the one who asked", async () => {
    const { manager, open } = fixture()

    const opening = manager.open(png, null)
    await vi.waitFor(() => expect(manager.requests()).toHaveLength(1))
    await manager.cancel(manager.requests()[0]!.identity)

    await expect(opening).rejects.toThrow(/Nothing was chosen/)
    expect(open).not.toHaveBeenCalled()
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

test("a request from outside ends when the connection that asked closes", async () => {
    const { manager, open } = fixture()
    const connection = new AbortController()

    const opening = manager.open(png, null, connection.signal)
    await vi.waitFor(() => expect(manager.requests()).toHaveLength(1))
    connection.abort()

    await expect(opening).rejects.toThrow(/Nothing was chosen/)
    await vi.waitFor(() => expect(manager.requests()).toEqual([]))
    expect(open).not.toHaveBeenCalled()
})
