import { expect, test } from "vitest"
import type { WindowLayer } from "@phreshos/core"
import WindowPresentations, { type WindowPresentationEntry } from "@client/view/components/window-manager/window-presentations"

function fixture(layer: WindowLayer) {
    const client = (selected: WindowLayer) => ({ window: {
        layer: selected,
        title: "Original",
        header: selected === "window",
        frame: selected === "window",
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

test.each(["wallpaper", "start-menu"] as const)("%s exposes only concepts understood by its presentation", async layer => {
    const { own, entries, presentations } = fixture(layer)

    expect(presentations.read("own", "layer")).toBe(layer)
    for (const property of ["title", "position", "size", "minimized", "maximized", "header", "frame", "front"] as const) {
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
        () => presentations.setFrame("own", true),
        () => presentations.raise("own")
    ]
    for (const operation of unsupported) expect(operation).toThrow(new RegExp(`${layer} layer does not allow direct`))

    own.window.position = { x: 500, y: 600 }
    own.window.title = "Changed"
    presentations.reconcile(entries)
    expect(presentations.projection("own").position).toEqual({ x: 0, y: 0 })
    expect(presentations.projection("own").title).toBe("Original")

    expect(() => presentations.follow("own")).toThrow(new RegExp(`${layer} layer cannot follow`))
    expect(presentations.projection("own").title).toBe("Original")
    expect(presentations.projection("own").position).toEqual({ x: 0, y: 0 })
})

test.each(["under", "over"] as const)("%s presents geometry and frame without a header", async layer => {
    const { own, entries, presentations } = fixture(layer)

    expect(() => presentations.read("own", "header")).toThrow(new RegExp(`${layer} layer has no header`))
    expect(() => presentations.read("own", "title")).toThrow(new RegExp(`${layer} layer has no title`))
    expect(() => presentations.setHeader("own", false)).toThrow(new RegExp(`${layer} layer cannot apply header`))
    expect(() => presentations.setTitle("own", "Changed")).toThrow(new RegExp(`${layer} layer cannot apply title`))

    await presentations.setFrame("own", { color: "primary", radius: "full" })
    expect(presentations.read("own", "frame")).toEqual({ color: "primary", radius: "full" })

    await presentations.follow("own")
    own.window.position = { x: 100, y: 200 }
    own.window.frame = true
    presentations.reconcile(entries)
    expect(presentations.projection("own").position).toEqual({ x: 100, y: 200 })
    expect(presentations.projection("own").frame).toBe(true)

    await presentations.unfollow("own")
    own.window.position = { x: 900, y: 900 }
    presentations.reconcile(entries)
    expect(presentations.projection("own").position).toEqual({ x: 100, y: 200 })
})

test("a standard presentation is observed locally and controlled through its authoritative Window", async () => {
    const { presentations } = fixture("window")

    expect(presentations.read("own", "frame")).toBe(true)
    const mutations = [
        () => presentations.move("own", { x: 1, y: 2 }),
        () => presentations.resize("own", { width: 300, height: 200 }),
        () => presentations.setGeometry("own", { x: 1, y: 2, width: 300, height: 200 }),
        () => presentations.minimize("own", true),
        () => presentations.maximize("own", true),
        () => presentations.setTitle("own", "Changed"),
        () => presentations.setHeader("own", false),
        () => presentations.setFrame("own", false),
        () => presentations.raise("own")
    ]
    for (const mutation of mutations) expect(mutation).toThrow(/window layer does not allow direct/)
    await expect(presentations.follow("own")).resolves.toBeUndefined()
    expect(() => presentations.unfollow("own")).toThrow(/window layer cannot unfollow/)
})

test("unsupported presentation events remain silent", () => {
    const { own, entries, presentations } = fixture("wallpaper")
    const received: string[] = []
    presentations.observe("own", null, event => received.push(event))

    own.window.position = { x: 500, y: 600 }
    own.window.title = "Changed"
    expect(() => presentations.follow("own")).toThrow(/wallpaper layer cannot follow/)
    presentations.reconcile(entries)

    expect(received).toEqual([])
})
