import { expect, test } from "vitest"
import type { WindowLayer } from "@phreshos/core"
import LocalWindows, { type LocalWindowEntry } from "@client/view/components/window-manager/local-windows"

function fixture(layer: WindowLayer) {
    const client = (layer: WindowLayer) => ({ window: {
        layer, title: "Original", position: { x: 20, y: 30 }, size: { width: 320, height: 240 },
        minimized: true, maximized: false, depth: 5
    } })
    const own = client(layer)
    const target = client("window")
    const entries = new Map([
        ["own", { identity: "own:0", client: own }],
        ["target", { identity: "target:0", client: target }]
    ]) as unknown as ReadonlyMap<string, LocalWindowEntry>
    const windows = new LocalWindows(entries, process => entries.get(process)?.client ?? null)
    return { own, target, entries, windows }
}

test.each(["wallpaper", "start-menu"] as const)("%s local geometry and visibility belong to Desktop, not authoritative state", async layer => {
    const { own, target, entries, windows } = fixture(layer)
    const initial = windows.projection("own")
    expect(initial).toMatchObject({ title: "", position: { x: 0, y: 0 }, size: { width: "100%", height: "100%" }, minimized: false, maximized: true, depth: 0, surface: null })
    const operations = [
        () => windows.move("own", { x: 1, y: 2 }),
        () => windows.resize("own", { width: 1, height: 2 }),
        () => windows.geometry("own", { position: { x: 1, y: 2 }, size: { width: 1, height: 2 } }),
        () => windows.minimize("own", true), () => windows.maximize("own", false),
        () => windows.title("own", "Local"), () => windows.raise("own"),
        () => windows.addSurface("own"), () => windows.removeSurface("own")
    ]
    for (const operation of operations) expect(operation).toThrow(new RegExp(`${layer} layer does not allow`))
    own.window.position = { x: 500, y: 600 }
    windows.reconcile(entries)
    expect(windows.projection("own")).toEqual(initial)
    await windows.follow("own", "target", { duration: 100, easing: "linear", wait: true })
    target.window.title = "Changed"
    target.window.position = { x: 100, y: 200 }
    target.window.size = { width: 400, height: 500 }
    target.window.minimized = false
    target.window.maximized = true
    target.window.depth = 100
    windows.reconcile(entries)
    expect(windows.projection("own")).toEqual(initial)
    await windows.unfollow("own")
    expect(own.window.title).toBe("Original")
    expect(own.window.position).toEqual({ x: 500, y: 600 })
})

test.each(["under", "over"] as const)("%s follows allowed properties without copying the title", async layer => {
    const { own, target, entries, windows } = fixture(layer)
    expect(() => windows.title("own", "Local")).toThrow(/local title/)
    await windows.follow("own", "target")
    target.window.title = "Changed"
    target.window.position = { x: 100, y: 200 }
    windows.reconcile(entries)
    expect(windows.projection("own").title).toBe("")
    expect(windows.projection("own").position).toEqual({ x: 100, y: 200 })
    expect(own.window.title).toBe("Original")
    await windows.unfollow("own")
    target.window.position = { x: 900, y: 900 }
    windows.reconcile(entries)
    expect(windows.projection("own").position).toEqual({ x: 100, y: 200 })
    // The receiving layer defines projection, even when the target is bare.
    await windows.follow("target", "own")
    expect(windows.projection("target").title).toBe("Original")
    windows.title("target", "Local title")
    expect(windows.projection("target").title).toBe("Local title")
})
