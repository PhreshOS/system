import { bearingsOf } from "@client/view/structure/desktop/layers/shell/taskbar/map/window-bearings"
import type { MappedWindow } from "@client/view/structure/desktop/layers/shell/taskbar/map/map-control"
import type { Viewport } from "@client/view/structure/desktop/viewport-offset"
import { expect, test } from "vitest"

// A 1000 by 800 screen showing the middle view; a mark's middle stays 44 pixels inside each edge.
const viewport = { size: { width: 1000, height: 800 }, offset: { x: 0, y: 0 } } as unknown as Viewport
const margins = { top: 0, right: 0, bottom: 0, left: 0 }
const size = { card: 20, arrow: 10, inset: 20, gap: 4 }

function window(identity: string, x: number, y: number, minimized = false) {
    return { identity, icon: "", focused: false, minimized, region: { x, y, width: 200, height: 100 } } as unknown as MappedWindow
}

test("a Window in the next view to the right shows on the right edge, level with it, pointing right", () => {
    const [bearing] = bearingsOf([window("w", 900, -50)], viewport, margins, size)
    expect(bearing).toMatchObject({ edge: "right", x: 956, y: 400, angle: 0 })
})

test("a Window up and to the left shows on the edge its direction crosses first", () => {
    const [bearing] = bearingsOf([window("w", -2100, -1050)], viewport, margins, size)
    expect(bearing.edge).toBe("left")
    expect(bearing.x).toBe(44)
    expect(bearing.y).toBeLessThan(400)
    expect(bearing.angle).toBeLessThan(-90)
})

test("a Window with any part in view, or minimized, shows no mark", () => {
    expect(bearingsOf([window("in", 450, -50), window("hidden", 2000, 0, true)], viewport, margins, size)).toEqual([])
})

test("marks that would cover each other stand side by side along their edge, inside it", () => {
    const bearings = bearingsOf([window("one", 1500, -50), window("two", 1600, -50), window("three", 1700, -50)], viewport, margins, size)
    const ys = bearings.map(bearing => bearing.y).sort((one, other) => one - other)
    expect(bearings.every(bearing => bearing.edge === "right" && bearing.x === 956)).toBe(true)
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(24)
    expect(ys[2] - ys[1]).toBeGreaterThanOrEqual(24)
    expect(ys[0]).toBeGreaterThanOrEqual(44)
    expect(ys[2]).toBeLessThanOrEqual(756)
})
