import { expect, test } from "vitest"
import type { WindowLayer } from "@phreshos/core"
import WindowPresentations, { type WindowPresentationEntry } from "@client/view/components/window-manager/window-presentations"

function fixture(layer: WindowLayer) {
    const client = (selected: WindowLayer) => ({ window: {
        layer: selected,
        title: "Original",
        header: selected === "window",
        surface: selected === "window",
        transaction: false,
        position: { x: 20, y: 30 },
        size: { width: 320, height: 240 },
        minimized: true,
        maximized: false,
        depth: 5
    } })
    const own = client(layer)
    const entries = new Map([
        ["own", { identity: "own:0", client: own }]
    ]) as unknown as ReadonlyMap<string, WindowPresentationEntry>
    const presentations = new WindowPresentations(entries, process => entries.get(process)?.client ?? null)
    return { own, entries, presentations }
}

test("wallpaper exposes only concepts understood by its presentation", async () => {
    const layer = "wallpaper"
    const { own, entries, presentations } = fixture(layer)

    expect(presentations.read("own", "layer")).toBe(layer)
    for (const property of ["title", "position", "size", "minimized", "maximized", "header", "surface", "front"] as const) {
        expect(() => presentations.read("own", property)).toThrow(new RegExp(`${layer} layer has no`))
    }

    const unsupported = [
        () => presentations.move("own", { x: 1, y: 2 }),
        () => presentations.resize("own", { width: 1, height: 2 }),
        () => presentations.setGeometry("own", { x: 1, y: 2, width: 1, height: 2 }),
        () => presentations.minimize("own", true),
        () => presentations.maximize("own", false),
        () => presentations.setTitle("own", "Changed"),
        () => presentations.setHeader("own", false),
        () => presentations.setSurface("own", true),
        () => presentations.raise("own")
    ]
    for (const operation of unsupported) expect(operation).toThrow(new RegExp(`${layer} layer cannot apply`))

    own.window.position = { x: 500, y: 600 }
    own.window.title = "Changed"
    presentations.reconcile(entries)
    expect(presentations.projection("own").position).toEqual({ x: 0, y: 0 })
    expect(presentations.projection("own").title).toBe("Original")

    await expect(presentations.follow("own")).resolves.toBeUndefined()
    await expect(presentations.unfollow("own")).resolves.toBeUndefined()
    expect(presentations.projection("own").title).toBe("Original")
    expect(presentations.projection("own").position).toEqual({ x: 0, y: 0 })
})

test.each(["under", "over", "shell"] as const)("%s presents geometry and surface without a header", async layer => {
    const { own, entries, presentations } = fixture(layer)

    expect(() => presentations.read("own", "header")).toThrow(new RegExp(`${layer} layer has no header`))
    expect(() => presentations.read("own", "title")).toThrow(new RegExp(`${layer} layer has no title`))
    expect(() => presentations.setHeader("own", false)).toThrow(new RegExp(`${layer} layer cannot apply header`))
    expect(() => presentations.setTitle("own", "Changed")).toThrow(new RegExp(`${layer} layer cannot apply title`))

    await presentations.setSurface("own", { color: "primary", radius: "full" })
    expect(presentations.read("own", "surface")).toEqual({ color: "primary", radius: "full" })

    await presentations.follow("own")
    own.window.position = { x: 100, y: 200 }
    own.window.surface = true
    presentations.reconcile(entries)
    expect(presentations.projection("own").position).toEqual({ x: 100, y: 200 })
    expect(presentations.projection("own").surface).toBe(true)

    await presentations.unfollow("own")
    own.window.position = { x: 900, y: 900 }
    presentations.reconcile(entries)
    expect(presentations.projection("own").position).toEqual({ x: 100, y: 200 })
})

test("a standard presentation can leave authoritative following and take local control", async () => {
    const { presentations } = fixture("window")

    expect(presentations.read("own", "surface")).toBe(true)
    await presentations.unfollow("own")
    await presentations.setGeometry("own", { x: 1, y: 2, width: 300, height: 200 })
    presentations.setTitle("own", "Changed")
    presentations.setHeader("own", false)
    await presentations.setSurface("own", false)
    expect(presentations.state("own")).toMatchObject({
        title: "Changed", header: false, surface: false,
        position: { x: 1, y: 2 }, size: { width: 300, height: 200 }
    })
    await expect(presentations.follow("own")).resolves.toBeUndefined()
    await expect(presentations.unfollow("own")).resolves.toBeUndefined()
})

test("unsupported presentation events remain silent", async () => {
    const { own, entries, presentations } = fixture("wallpaper")
    const received: string[] = []
    presentations.observe("own", null, event => received.push(event))

    own.window.position = { x: 500, y: 600 }
    own.window.title = "Changed"
    await expect(presentations.follow("own")).resolves.toBeUndefined()
    presentations.reconcile(entries)

    expect(received).toEqual([])
})
