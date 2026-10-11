import { expect, test } from "vitest"
import { overWindow, weighted } from "@server/core/link-manager/auth-manager/program-manager/window-placement"

test("a window opens centered over another, in pixels", () => {
    expect(overWindow({ position: { x: -400, y: -300 }, size: { width: 800, height: 600 } }, { width: 400, height: 200 })).toEqual({ x: -200, y: -100 })
})

test("a window opens centered over one placed by shares of the view, keeping them shares", () => {
    // The asker fills the left half: its center is a quarter in from the left.
    expect(overWindow({ position: { x: "-50%", y: "-50%" }, size: { width: "1/2", height: "1/1" } }, { width: 400, height: 300 }))
        .toEqual({ x: "-25% - 200", y: -150 })
    expect(overWindow({ position: { x: -300, y: 0 }, size: { width: 600, height: 400 } }, { width: "1/2", height: "1/2" }))
        .toEqual({ x: "-25%", y: "-25% + 200" })
})

test("a weighted sum stays one value, with no float dust and no negative zero", () => {
    expect(weighted([["1/3", 0.5], ["1/3", 0.5]])).toBe("33.3333%")
    expect(weighted([[0, -0.5]])).toBe(0)
    expect(Object.is(weighted([[0, -0.5]]), -0)).toBe(false)
})
