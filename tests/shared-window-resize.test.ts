import assert from "node:assert/strict"
import { resizeSharedBoundary, sharedResizeBoundaries, type SharedResizeWindow } from "@client/view/components/window-manager/shared-resize"
import { test } from "vitest"

test("a shared boundary resizes the windows on both sides", () => {

    const windows: SharedResizeWindow[] = [
        { identity: "left", geometry: { x: 0, y: 0, width: 500, height: 600 }, depth: 1 },
        { identity: "right", geometry: { x: 500, y: 0, width: 500, height: 600 }, depth: 2 }
    ]

    const boundaries = sharedResizeBoundaries(windows)

    assert.equal(boundaries.length, 1)

    assert.deepEqual(boundaries[0], {
        identity: "vertical:left:right",
        orientation: "vertical",
        position: 500,
        start: 0,
        end: 600,
        before: ["left"],
        after: ["right"],
        segments: [{ start: 0, end: 600, depth: 2 }]
    })

    const resized = resizeSharedBoundary(boundaries[0], windows, 80)

    assert.equal(resized.delta, 80)

    assert.deepEqual(resized.geometries.get("left"), { x: 0, y: 0, width: 580, height: 600 })

    assert.deepEqual(resized.geometries.get("right"), { x: 580, y: 0, width: 420, height: 600 })
})

test("one continuous boundary coordinates every window that shares it", () => {

    const windows: SharedResizeWindow[] = [
        { identity: "left-top", geometry: { x: 0, y: 0, width: 500, height: 300 }, depth: 2 },
        { identity: "left-bottom", geometry: { x: 0, y: 300, width: 500, height: 300 }, depth: 4 },
        { identity: "right-top", geometry: { x: 500, y: 0, width: 500, height: 300 }, depth: 3 },
        { identity: "right-bottom", geometry: { x: 500, y: 300, width: 500, height: 300 }, depth: 7 }
    ]

    const boundary = sharedResizeBoundaries(windows).find(candidate => candidate.orientation === "vertical")

    assert(boundary)

    assert.deepEqual(boundary.before, ["left-bottom", "left-top"])

    assert.deepEqual(boundary.after, ["right-bottom", "right-top"])

    assert.deepEqual([boundary.start, boundary.end], [0, 600])

    assert.deepEqual(boundary.segments, [
        { start: 0, end: 300, depth: 3 },
        { start: 300, end: 600, depth: 7 }
    ])
})

test("the smallest participating window constrains the whole boundary", () => {

    const windows: SharedResizeWindow[] = [
        { identity: "left", geometry: { x: 0, y: 0, width: 500, height: 600 }, depth: 1 },
        { identity: "right-small", geometry: { x: 500, y: 0, width: 300, height: 300 }, depth: 2 },
        { identity: "right-large", geometry: { x: 500, y: 300, width: 500, height: 300 }, depth: 3 }
    ]

    const boundary = sharedResizeBoundaries(windows).find(candidate => candidate.orientation === "vertical")

    assert(boundary)

    const resized = resizeSharedBoundary(boundary, windows, 100)

    assert.equal(resized.delta, 40)

    assert.equal(resized.geometries.get("right-small")?.width, 260)

    assert.equal(resized.geometries.get("right-large")?.width, 460)
})

test("a horizontal boundary changes heights and the lower origins", () => {

    const windows: SharedResizeWindow[] = [
        { identity: "top", geometry: { x: 0, y: 0, width: 700, height: 300 }, depth: 1 },
        { identity: "bottom", geometry: { x: 0, y: 300, width: 700, height: 400 }, depth: 2 }
    ]

    const boundary = sharedResizeBoundaries(windows).find(candidate => candidate.orientation === "horizontal")

    assert(boundary)

    const resized = resizeSharedBoundary(boundary, windows, -50)

    assert.deepEqual(resized.geometries.get("top"), { x: 0, y: 0, width: 700, height: 250 })

    assert.deepEqual(resized.geometries.get("bottom"), { x: 0, y: 250, width: 700, height: 450 })
})

test("unaligned and merely overlapping windows have no shared boundary", () => {

    assert.deepEqual(sharedResizeBoundaries([
        { identity: "first", geometry: { x: 0, y: 0, width: 400, height: 400 }, depth: 1 },
        { identity: "second", geometry: { x: 300, y: 100, width: 400, height: 400 }, depth: 2 }
    ]), [])
})
