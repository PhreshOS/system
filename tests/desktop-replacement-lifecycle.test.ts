import { expect, test, vi } from "vitest"
import { TheLink } from "@the-link/core"
import type { ClientLaunch, Layer } from "@phreshos/core"
import type AuthManager from "@server/core/link-manager/auth-manager/auth-manager"
import Program from "@server/core/link-manager/auth-manager/program-manager/program"
import ProcessManager from "@server/core/link-manager/auth-manager/process-manager/process-manager"
import type { ServerRuntimeFactory } from "@server/core/server-runtime"
import type { DesktopReplacementLayer } from "@shared/window-layers"

const replacementLayers = ["wallpaper"] as const satisfies readonly DesktopReplacementLayer[]

function fixture(replacementLayer: DesktopReplacementLayer) {
    const auth = new TheLink() as unknown as AuthManager
    const manager = new ProcessManager(auth)
    const program = new Program({ identity: "replacement-test", client: { location: "https://example.test/" } })
    const other = new Program({ identity: "other-test", client: { location: "https://example.test/" } })
    vi.spyOn(program, "validate").mockResolvedValue()
    vi.spyOn(other, "validate").mockResolvedValue()
    const shape = (layer: Layer = replacementLayer) => ({
        title: "Replacement", header: layer === "window", surface: false, transaction: false,
        position: { x: 20, y: 30 }, size: { width: 320, height: 240 },
        layer, minimize: false, maximize: false
    })
    Object.assign(auth, {
        programManager: {
            permission() { return null },
            clientShape(_program: Program, launch: ClientLaunch) { return shape(launch.layer) }
        }
    })
    const register = (identity: string, layer: Layer | null = replacementLayer, runtime: ServerRuntimeFactory<Program> | null = null, owner = program) => manager.register(
        identity, null, owner, {}, { server: null, client: null, options: {} },
        runtime, layer !== null, shape(layer ?? replacementLayer), null
    )
    return { manager, program, other, register }
}

test.each(replacementLayers)("concurrent %s launches replace the incumbent Process in order", async replacementLayer => {
    const { manager, register } = fixture(replacementLayer)
    const results = await Promise.allSettled([register("first"), register("second")])
    expect(results.map(result => result.status)).toEqual(["fulfilled", "fulfilled"])
    expect(manager.processes.has("first")).toBe(false)
    expect(manager.processes.has("second")).toBe(true)
    expect(manager.processes.size).toBe(1)
    const incumbent = [...manager.processes.values()][0]!
    expect(incumbent.clientEndpoint?.window.layer).toBe(replacementLayer)
    incumbent.clientEndpoint!.window.minimized = true
    await register("third")
    expect(manager.processes.has(incumbent.identity)).toBe(false)
    expect(incumbent.client).toBeNull()
    await register("ordinary", "window")
    await register("overlay", "over")
    expect((await register("replacement")).clientEndpoint?.window.layer).toBe(replacementLayer)
    expect(manager.processes.has("third")).toBe(false)
    expect(manager.processes.has("ordinary")).toBe(true)
    expect(manager.processes.has("overlay")).toBe(true)
})

test.each(replacementLayers)("%s replacement finishes before the new Server runtime is created", async replacementLayer => {
    const { manager, register } = fixture(replacementLayer)
    await register("incumbent")
    const runtime = vi.fn(() => {
        expect(manager.processes.has("incumbent")).toBe(false)
        throw new Error("runtime creation failed")
    })
    await expect(register("replacement", replacementLayer, runtime)).rejects.toThrow("runtime creation failed")
    expect(runtime).toHaveBeenCalledOnce()
    expect(manager.processes.size).toBe(0)
    await register("next")
    expect(manager.processes.has("next")).toBe(true)
})

test.each(replacementLayers)("starting an existing Client and creating a Process share the %s claim", async replacementLayer => {
    const { manager, register } = fixture(replacementLayer)
    await register("existing", null)
    const results = await Promise.allSettled([
        manager.startClient("existing", { layer: replacementLayer }), register("new")
    ])
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(2)
    expect([...manager.processes.values()].filter(process => process.client && process.clientEndpoint?.window.layer === replacementLayer)).toHaveLength(1)
    expect(manager.processes.has("existing")).toBe(false)
    const waiting = await register("waiting", null)
    await manager.startClient("waiting", { layer: replacementLayer })
    expect(manager.processes.has("new")).toBe(false)
    expect(waiting.clientEndpoint?.window.layer).toBe(replacementLayer)
})

test.each(replacementLayers)("failed activation releases the %s claim", async replacementLayer => {
    const { manager, register } = fixture(replacementLayer)
    let fail = true
    manager.$outbound.subscribe("/client-start", () => {
        if (fail) throw new Error("publication failed")
    })
    await expect(register("failed")).rejects.toThrow("publication failed")
    expect(manager.processes.has("failed")).toBe(false)
    await register("existing", null)
    await expect(manager.startClient("existing", { layer: replacementLayer })).rejects.toThrow("publication failed")
    expect(manager.processes.get("existing")!.client).toBeNull()
    fail = false
    await manager.startClient("existing", { layer: replacementLayer })
    expect(manager.processes.get("existing")!.clientEndpoint?.window.layer).toBe(replacementLayer)
})

test("shell ownership keeps sibling Processes and terminates a displaced Program", async () => {
    const { manager, program, other, register } = fixture("wallpaper")
    await Promise.all([
        register("first", "shell", null, program),
        register("second", "shell", null, program)
    ])
    await register("ordinary", "window", null, program)

    expect(manager.processes.has("first")).toBe(true)
    expect(manager.processes.has("second")).toBe(true)

    const runtime: ServerRuntimeFactory<Program> = vi.fn(() => {
        expect(manager.processes.has("first")).toBe(false)
        expect(manager.processes.has("second")).toBe(false)
        throw new Error("runtime creation failed")
    })
    await expect(register("failed", "shell", runtime, other)).rejects.toThrow("runtime creation failed")
    await register("replacement", "shell", null, other)

    expect(runtime).toHaveBeenCalledOnce()
    expect(manager.processes.has("ordinary")).toBe(true)
    expect(manager.processes.has("replacement")).toBe(true)
})

test("starting a shell Client claims the layer for its Program", async () => {
    const { manager, program, other, register } = fixture("wallpaper")
    await register("incumbent", "shell", null, program)
    await register("waiting", null, null, other)

    await manager.startClient("waiting", { layer: "shell" })

    expect(manager.processes.has("incumbent")).toBe(false)
    expect(manager.processes.get("waiting")!.clientEndpoint?.window.layer).toBe("shell")
})
