import { expect, test, vi } from "vitest"
import { TheLink } from "@the-link/core"
import type { ClientLaunch, Layer } from "@phreshos/core"
import type AuthManager from "@server/core/link-manager/auth-manager/auth-manager"
import Program from "@server/core/link-manager/auth-manager/program-manager/program"
import ProcessManager from "@server/core/link-manager/auth-manager/process-manager/process-manager"
import type { ServerRuntimeFactory } from "@server/core/server-runtime"

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
    const register = (identity: string, layer: Layer | null = "wallpaper", runtime: ServerRuntimeFactory<Program> | null = null) => manager.register(
        identity, null, program, {}, { server: null, client: null, options: {} },
        runtime, layer !== null, layer === null ? null : shape(layer), null
    )
    return { manager, register }
}

test("concurrent wallpaper launches replace the incumbent Process in order", async () => {
    const { manager, register } = fixture()
    const results = await Promise.allSettled([register("first"), register("second")])
    expect(results.map(result => result.status)).toEqual(["fulfilled", "fulfilled"])
    expect(manager.processes.has("first")).toBe(false)
    expect(manager.processes.has("second")).toBe(true)
    expect(manager.processes.size).toBe(1)
    const incumbent = [...manager.processes.values()][0]!
    expect(incumbent.client?.window.layer).toBe("wallpaper")
    incumbent.client!.window.minimized = true
    await register("third")
    expect(manager.processes.has(incumbent.identity)).toBe(false)
    expect(incumbent.client).toBeNull()
    await register("ordinary", "window")
    await register("overlay", "over")
    expect((await register("replacement")).client?.window.layer).toBe("wallpaper")
    expect(manager.processes.has("third")).toBe(false)
    expect(manager.processes.has("ordinary")).toBe(true)
    expect(manager.processes.has("overlay")).toBe(true)
})

test("wallpaper replacement finishes before the new Server runtime is created", async () => {
    const { manager, register } = fixture()
    await register("incumbent")
    const runtime = vi.fn(() => {
        expect(manager.processes.has("incumbent")).toBe(false)
        throw new Error("runtime creation failed")
    })
    await expect(register("replacement", "wallpaper", runtime)).rejects.toThrow("runtime creation failed")
    expect(runtime).toHaveBeenCalledOnce()
    expect(manager.processes.size).toBe(0)
    await register("next")
    expect(manager.processes.has("next")).toBe(true)
})

test("starting an existing Client and creating a Process share the wallpaper claim", async () => {
    const { manager, register } = fixture()
    await register("existing", null)
    const results = await Promise.allSettled([
        manager.startClient("existing", { layer: "wallpaper" }), register("new")
    ])
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(2)
    expect([...manager.processes.values()].filter(process => process.client?.window.layer === "wallpaper")).toHaveLength(1)
    expect(manager.processes.has("existing")).toBe(false)
    const waiting = await register("waiting", null)
    await manager.startClient("waiting", { layer: "wallpaper" })
    expect(manager.processes.has("new")).toBe(false)
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
