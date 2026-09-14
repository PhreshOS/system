import { expect, test, vi } from "vitest"
import { TheLink } from "@the-link/core"
import type { ClientLaunch, Layer } from "@phreshos/core"
import type AuthManager from "@server/core/link-manager/auth-manager/auth-manager"
import Program from "@server/core/link-manager/auth-manager/program-manager/program"
import ProcessManager from "@server/core/link-manager/auth-manager/process-manager/process-manager"

function fixture() {
    const auth = new TheLink() as unknown as AuthManager
    const manager = new ProcessManager(auth)
    const program = new Program({ identity: "wallpaper-test", client: { location: "https://example.test/" } })
    vi.spyOn(program, "validate").mockResolvedValue()
    const shape = (layer: Layer = "wallpaper") => ({
        title: "Wallpaper", position: { x: 20, y: 30 }, size: { width: 320, height: 240 },
        layer, minimize: false, maximize: false
    })
    Object.assign(auth, {
        programManager: {
            permission() { return null },
            clientShape(_program: Program, launch: ClientLaunch) { return shape(launch.layer) }
        }
    })
    const register = (identity: string, layer: Layer | null = "wallpaper") => manager.register(
        identity, null, program, {}, { server: null, client: null, options: {} },
        null, layer !== null, layer === null ? null : shape(layer), null
    )
    return { manager, register }
}

test("concurrent wallpaper launches have one winner without stopping the incumbent", async () => {
    const { manager, register } = fixture()
    const results = await Promise.allSettled([register("first"), register("second")])
    expect(results.map(result => result.status).sort()).toEqual(["fulfilled", "rejected"])
    const failure = results.find(result => result.status === "rejected") as PromiseRejectedResult
    expect(failure.reason.message).toMatch(/already running in the wallpaper layer/)
    expect(manager.processes.size).toBe(1)
    const incumbent = [...manager.processes.values()][0]!
    expect(incumbent.client?.window.layer).toBe("wallpaper")
    incumbent.client!.window.minimized = true
    await expect(register("third")).rejects.toThrow(/already running/)
    expect(incumbent.client).not.toBeNull()
    await register("ordinary", "window")
    await register("overlay", "over")
    await manager.remove(incumbent.identity)
    expect((await register("replacement")).client?.window.layer).toBe("wallpaper")
})

test("starting an existing Client and creating a Process share the wallpaper claim", async () => {
    const { manager, register } = fixture()
    await register("existing", null)
    const results = await Promise.allSettled([
        manager.startClient("existing", { layer: "wallpaper" }), register("new")
    ])
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1)
    expect([...manager.processes.values()].filter(process => process.client?.window.layer === "wallpaper")).toHaveLength(1)
    const incumbent = [...manager.processes.values()].find(process => process.client)!
    if (incumbent.identity === "existing") {
        await register("waiting", null)
        await expect(manager.startClient("waiting", { layer: "wallpaper" })).rejects.toThrow(/already running/)
        expect(manager.processes.get("waiting")!.client).toBeNull()
    } else {
        expect(manager.processes.get("existing")!.client).toBeNull()
    }
    await manager.remove(incumbent.identity)
    const waiting = [...manager.processes.values()].find(process => !process.client)!
    await manager.startClient(waiting.identity, { layer: "wallpaper" })
    expect(waiting.client?.window.layer).toBe("wallpaper")
})

test("failed activation releases the wallpaper claim", async () => {
    const { manager, register } = fixture()
    let fail = true
    manager.$outbound.subscribe("/client-start", () => {
        if (fail) throw new Error("publication failed")
    })
    await expect(register("failed")).rejects.toThrow("publication failed")
    expect(manager.processes.has("failed")).toBe(false)
    await register("existing", null)
    await expect(manager.startClient("existing", { layer: "wallpaper" })).rejects.toThrow("publication failed")
    expect(manager.processes.get("existing")!.client).toBeNull()
    fail = false
    await manager.startClient("existing", { layer: "wallpaper" })
    expect(manager.processes.get("existing")!.client?.window.layer).toBe("wallpaper")
})
