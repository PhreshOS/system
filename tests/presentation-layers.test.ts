import { expect, test } from "vitest"
import type { WindowLayer } from "@phreshos/core"
import Presentations, { type PresentationEntry } from "@client/view/components/window-manager/presentations"

function fixture(layer: WindowLayer) {
  const client = { window: {
    layer,
    title: "Original",
    header: layer === "window",
    position: { x: 20, y: 30 },
    size: { width: 320, height: 240 },
    minimized: true,
    maximized: false,
    depth: 5
  } }
  const entries = new Map([["own", { identity: "own:0", client }]]) as unknown as ReadonlyMap<string, PresentationEntry>
  return { client, entries, presentations: new Presentations(entries, () => client as never) }
}

test("wallpaper is fixed and rejects both raw operations and move gestures", () => {
  const { presentations } = fixture("wallpaper")
  expect(presentations.projection("own").layer).toBe("wallpaper")
  expect(presentations.projection("own")).toMatchObject({
    position: { x: "-1/2", y: "-1/2" }, size: { width: "1/1", height: "1/1" }, surface: false, interactive: true
  })
  expect(() => presentations.move("own", { x: 1, y: 2 })).toThrow(/does not support raw/)
  expect(() => presentations.setInteractive("own", false)).toThrow(/does not support raw/)
  expect(() => presentations.raise("own")).toThrow(/does not support raw/)
  expect(() => presentations.beginMoveGesture("own", "gesture", { x: 0, y: 0 }, { x: 1, y: 1 })).toThrow(/nowhere to move/)
})

test.each(["under", "over", "shell"] as const)("%s is controlled only through raw presentation operations", async layer => {
  const { client, entries, presentations } = fixture(layer)
  expect(presentations.projection("own").layer).toBe(layer)
  expect(presentations.projection("own")).toMatchObject({
    position: { x: 0, y: 0 }, size: { width: 0, height: 0 }, surface: false, header: false, interactive: true
  })
  await presentations.setGeometry("own", { x: 10, y: 20, width: 400, height: 300 })
  await presentations.setSurface("own", true)
  presentations.setInteractive("own", false)
  expect(presentations.projection("own")).toMatchObject({
    position: { x: 10, y: 20 }, size: { width: 400, height: 300 }, surface: true, interactive: false
  })

  client.window.position = { x: 800, y: 900 }
  client.window.size = { width: 900, height: 700 }
  entries.get("own")!.client = client as never
  presentations.reconcile(entries)
  expect(presentations.projection("own").position).toEqual({ x: 10, y: 20 })
  expect(presentations.projection("own").interactive).toBe(false)

  presentations.begin("own")
  expect(presentations.projection("own").interactive).toBe(true)
  // A raw drawing may hand a move to the Desktop too, once its Window can take one.
  expect(() => presentations.beginMoveGesture("own", "gesture", { x: 0, y: 0 }, { x: 1, y: 1 })).toThrow(/cannot currently begin/)
})

test("standard Window presentation is exclusively Desktop-controlled", () => {
  const { presentations } = fixture("window")
  expect(presentations.projection("own").layer).toBe("window")
  expect(() => presentations.resize("own", { width: 1, height: 2 })).toThrow(/does not support raw/)
  expect(() => presentations.setSurface("own", false)).toThrow(/does not support raw/)
  expect(() => presentations.setInteractive("own", false)).toThrow(/does not support raw/)
  expect(() => presentations.raise("own")).toThrow(/does not support raw/)
})

test("a standard Window shows a change at once and follows the System once its request settles", async () => {
  const { client, presentations } = fixture("window")
  let accept!: () => void
  let reject!: () => void

  // Shown at once while the System has not answered.
  presentations.anticipate("own", { minimized: false, front: true }, new Promise<void>(resolve => { accept = resolve }))
  expect(presentations.projection("own")).toMatchObject({ minimized: false })
  expect(presentations.projection("own").depth).toBeGreaterThan(5)

  // Accepted: the System's record now says the same, and it is what is shown.
  client.window.minimized = false
  client.window.depth = 6
  accept()
  await new Promise(resolve => setTimeout(resolve))
  expect(presentations.projection("own")).toMatchObject({ minimized: false, depth: 6 })

  // Rejected: the System kept what it had, and the Window returns to it.
  presentations.anticipate("own", { maximized: true }, new Promise<void>((_, fail) => { reject = () => fail(new Error("refused")) }))
  expect(presentations.projection("own")).toMatchObject({ maximized: true })
  reject()
  await new Promise(resolve => setTimeout(resolve))
  expect(presentations.projection("own")).toMatchObject({ maximized: false })
})

test("each layer starts fixed to what it lives on", () => {
  expect(fixture("window").presentations.projection("own").anchor).toBe("plane")
  for (const layer of ["wallpaper", "under", "over", "shell"] as const) expect(fixture(layer).presentations.projection("own").anchor).toBe("viewport")
})

test.each(["under", "over"] as const)("a drawing in %s is fixed to the plane where it stands on the screen", async layer => {
  const { presentations } = fixture(layer)
  await presentations.setGeometry("own", { x: 10, y: 20, width: 400, height: 300 })
  presentations.follow({ x: 1440, y: -900 })

  // Its position is counted again from the plane's center, so it does not move on the screen.
  presentations.setAnchor("own", "plane")
  expect(presentations.projection("own")).toMatchObject({ anchor: "plane", position: { x: 1450, y: -880 } })

  presentations.follow({ x: 0, y: 0 })
  presentations.setAnchor("own", "viewport")
  expect(presentations.projection("own")).toMatchObject({ anchor: "viewport", position: { x: 1450, y: -880 } })
})

test("only under and over choose what they are fixed to", () => {
  expect(() => fixture("window").presentations.setAnchor("own", "viewport")).toThrow(/does not support raw/)
  expect(() => fixture("wallpaper").presentations.setAnchor("own", "plane")).toThrow(/does not support raw/)
  expect(() => fixture("shell").presentations.setAnchor("own", "plane")).toThrow(/always fixed to the viewport/)
})

test("the plane is five views across and down, whatever the Desktop's size", async () => {
  const { planeSize } = await import("@client/view/components/window-manager/window-geometry")
  expect(planeSize({ width: 1440, height: 900 })).toEqual({ width: 7200, height: 4500 })
  expect(planeSize({ width: 1024, height: 768 })).toEqual({ width: 5120, height: 3840 })
})
