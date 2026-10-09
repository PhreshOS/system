import assert from "node:assert/strict"
import ClientWindow from "@client/core/link-manager/auth-manager/process-manager/window"
import ClientProcessManager from "@client/core/link-manager/auth-manager/process-manager/process-manager"
import ProcessManager from "@server/core/link-manager/auth-manager/process-manager/process-manager"
import ServerWindow from "@server/core/link-manager/auth-manager/process-manager/window"
import { allWindowSides, boundedGeometry, constrainWindowGeometry, contactInsets, letGoOfEdges, minimumWindowSize, noPaintMargins, planeGeometry, recordedPosition, resolveWindowGeometry, shiftPosition, snapPlacement, viewOfGeometry, windowEdgeContacts, windowPaintInsets } from "@client/view/components/window-manager/window-geometry"
import { defaultAppearance } from "@phreshos/core"
import { TheLink } from "@the-link/core"
import { expect, test } from "vitest"

test("a position is the top-left corner on a plane whose zero is the surface's center", () => {
  const surface = { width: 1200, height: 800 }

  // Zero is the center; the surface's own corner is half of it before.
  assert.deepEqual(resolveWindowGeometry({ x: 0, y: 0 }, { width: 100, height: 50 }, surface), { x: 600, y: 400, width: 100, height: 50 })
  assert.deepEqual(resolveWindowGeometry({ x: "-1/2", y: "-1/2" }, { width: "1/1", height: "1/1" }, surface), { x: 0, y: 0, width: 1200, height: 800 })
  assert.deepEqual(resolveWindowGeometry({ x: -50, y: "1/4 - 10" }, { width: 100, height: 50 }, surface), { x: 550, y: 590, width: 100, height: 50 })

  // What the Desktop paints returns to the plane unchanged.
  const region = { x: 180, y: 90, width: 300, height: 200 }
  assert.deepEqual(planeGeometry(region, surface), { x: -420, y: -310, width: 300, height: 200 })
  assert.deepEqual(resolveWindowGeometry(planeGeometry(region, surface), region, surface), region)
})

test("the view moves a position by whole shares of the surface, so it keeps to its view at any size", () => {
  assert.deepEqual(shiftPosition({ x: 120, y: -40 }, { x: 1, y: 0 }), { x: "100% + 120", y: -40 })
  assert.deepEqual(shiftPosition({ x: "-1/2", y: "0/1" }, { x: 1, y: -1 }), { x: "50%", y: "-100%" })
  assert.deepEqual(shiftPosition({ x: "50%", y: 10 }, { x: -1, y: 0 }), { x: "-50%", y: 10 })
  assert.deepEqual(shiftPosition({ x: "100% - 30", y: 10 }, { x: -1, y: 0 }), { x: -30, y: 10 })

  // What a Desktop shows two views to the right returns to the plane unchanged, whatever its size.
  for (const surface of [{ width: 1200, height: 800 }, { width: 1440, height: 900 }]) {
    const stored = { x: "150%", y: 100 }
    const shown = resolveWindowGeometry(shiftPosition(stored, { x: -2, y: 0 }), { width: 600, height: 400 }, surface)
    assert.deepEqual(shown, { x: 0, y: surface.height / 2 + 100, width: 600, height: 400 })
    const recorded = shiftPosition(planeGeometry(shown, surface), { x: 2, y: 0 })
    assert.deepEqual(resolveWindowGeometry(recorded, { width: 600, height: 400 }, surface), resolveWindowGeometry(stored, { width: 600, height: 400 }, surface))
  }

  // A Window belongs to the view its center is in.
  assert.deepEqual(viewOfGeometry({ x: "50%", y: "-1/2" }, { width: "1/2", height: "1/1" }, { width: 1200, height: 800 }), { x: 1, y: 0 })
  assert.deepEqual(viewOfGeometry({ x: -300, y: "100% - 200" }, { width: 600, height: 400 }, { width: 1200, height: 800 }), { x: 0, y: 1 })

  // A point of the plane is recorded as its view and the pixels within it.
  assert.deepEqual(recordedPosition({ x: 2500, y: -100 }, { width: 1200, height: 800 }), { x: "200% + 100", y: -100 })
})

test("a standard presentation enforces its minimum after resolving authoritative geometry", () => {
  const surface = { width: 1200, height: 800 }
  const authoritative = resolveWindowGeometry({ x: "-1/2", y: "-1/2" }, { width: "1/2", height: 1 }, surface)

  assert.deepEqual(authoritative, { x: 0, y: 0, width: 600, height: 1 })
  assert.deepEqual(constrainWindowGeometry(authoritative, surface, minimumWindowSize), {
      x: 0, y: 0, width: 600, height: 160
  })
  assert.deepEqual(constrainWindowGeometry({ x: 0, y: 0, width: 1, height: 1 }, { width: 120, height: 80 }, minimumWindowSize), {
      x: 0, y: 0, width: 120, height: 80
  })
})

test("tiled standard windows share the Appearance gap, and keep the Desktop's margins at its edges", () => {
  const surface = { width: 1000, height: 600 }
  const half = defaultAppearance.spacing / 2
  const margins = { top: 12, right: 12, bottom: 68, left: 12 }
  const left = windowPaintInsets({ x: "-1/2", y: "-1/2" }, { width: "1/2", height: "1/1" }, surface, half, margins)
  const right = windowPaintInsets({ x: 0, y: "-1/2" }, { width: "1/2", height: "1/1" }, surface, half, margins)

  assert.deepEqual(left, { top: 12, right: half, bottom: 68, left: 12 })
  assert.deepEqual(right, { top: 12, right: 12, bottom: 68, left: half })
  assert.equal(left.right + right.left, defaultAppearance.spacing)
})

test("settling paint follows released geometry instead of its former boundary contacts", () => {
  const surface = { width: 1000, height: 600 }
  const half = defaultAppearance.spacing / 2
  const released = { x: 120, y: 90, width: 500, height: 300 }
  const former = windowPaintInsets({ x: "-1/2", y: "-1/2" }, { width: 500, height: 300 }, surface, half, noPaintMargins)

  assert.deepEqual(former, { top: 0, right: half, bottom: half, left: 0 })

  assert.deepEqual(
      windowPaintInsets({ x: "-1/2", y: "-1/2" }, { width: 500, height: 300 }, surface, half, noPaintMargins, released),
      { top: half, right: half, bottom: half, left: half }
  )
})

test("sides a hand carries let go of their edges without moving what is painted", () => {
  const surface = { width: 1000, height: 600 }
  const half = defaultAppearance.spacing / 2
  const margins = { top: 12, right: 12, bottom: 68, left: 12 }
  // The right half of the view: it meets the top, right, and bottom edges.
  const position = { x: 0, y: "-1/2" }, size = { width: "1/2", height: "1/1" }
  const box = resolveWindowGeometry(position, size, surface)
  const contacts = windowEdgeContacts(position, size, surface)
  const painted = (region: typeof box, insets: ReturnType<typeof contactInsets>) => ({
    x: region.x + insets.left, y: region.y + insets.top,
    width: region.width - insets.left - insets.right, height: region.height - insets.top - insets.bottom
  })

  assert.deepEqual(contacts, { top: true, right: true, bottom: true, left: false })

  // Moved, every side lets go; the box moves in, and the painted surface stays where it was.
  const carried = letGoOfEdges(box, contacts, allWindowSides, half, margins)
  assert.deepEqual(painted(carried, contactInsets({ top: false, right: false, bottom: false, left: false }, half, margins)), painted(box, contactInsets(contacts, half, margins)))

  // Pulled by its bottom edge, only that side lets go; the others keep their margins.
  const pulled = letGoOfEdges(box, contacts, { top: false, right: false, bottom: true, left: false }, half, margins)
  assert.deepEqual(painted(pulled, contactInsets({ ...contacts, bottom: false }, half, margins)), painted(box, contactInsets(contacts, half, margins)))
  assert.deepEqual({ x: pulled.x, y: pulled.y, width: pulled.width }, { x: box.x, y: box.y, width: box.width })
})

test("a tiled window keeps the margins of its own view while the Desktop looks between two", () => {
  const surface = { width: 1000, height: 600 }
  const half = defaultAppearance.spacing / 2
  const margins = { top: 12, right: 12, bottom: 68, left: 12 }
  // The Desktop looks three tenths of a view to the right: the Window's own view starts 300px left of the screen.
  const shown = { x: -300, y: 0, width: 500, height: 600 }

  assert.deepEqual(
    windowPaintInsets({ x: "-1/2", y: "-1/2" }, { width: "1/2", height: "1/1" }, surface, half, margins, shown, { x: 300, y: 0 }),
    { top: 12, right: half, bottom: 68, left: 12 }
  )
})

test("window geometry contract", async () => {
  const initial = {
      position: { x: 10, y: 20 },
      size: { width: 300, height: 200 }
  }

  const authority = new ServerWindow()
  authority.start({ title: "Geometry", header: true, layer: "window" }, initial.position, initial.size, 1, false)

  assert.throws(() => authority.setGeometry({
      x: 40,
      y: 50,
      width: Number.NaN,
      height: 240
  }), /width/)
  assert.deepEqual(authority.position, initial.position)
  assert.deepEqual(authority.size, initial.size)

  const next = {
      x: "1/4",
      y: 30,
      width: "1/2",
      height: 240
  }
  const events: unknown[][] = []
  const echoes: unknown[][] = []
  const manager = {
      $outbound: {
          async publish(...echo: unknown[]) {
              echoes.push(echo)
              return []
          }
      },
      mutableWindowOf(identity: string) {
          assert.equal(identity, "process")
          return authority
      },
      said(...event: unknown[]) {
          events.push(event)
      },
      async publishWindowChange(event: string, identity: string, window: ServerWindow) {
          const payload = { identity, window }
          await this.$outbound.publish(event, payload)
          return payload
      }
  }

  const echo = await ProcessManager.prototype.setGeometry.call(manager as unknown as ProcessManager, "process", next)

  const nextPosition = { x: next.x, y: next.y }
  const nextSize = { width: next.width, height: next.height }
  assert.deepEqual(authority.position, nextPosition)
  assert.deepEqual(authority.size, nextSize)
  assert.deepEqual(events, [
      ["process", "move", nextPosition],
      ["process", "resize", nextSize]
  ])
  assert.deepEqual(echoes, [["/set-geometry", { identity: "process", window: authority }]])
  assert.equal(echo.identity, "process")
  assert.equal(echo.window, authority)

  const unchangedEvents = events.length
  const unchangedEchoes = echoes.length
  await ProcessManager.prototype.setGeometry.call(manager as unknown as ProcessManager, "process", next)
  await ProcessManager.prototype.move.call(manager as unknown as ProcessManager, "process", nextPosition)
  await ProcessManager.prototype.resize.call(manager as unknown as ProcessManager, "process", nextSize)
  await ProcessManager.prototype.setTitle.call(manager as unknown as ProcessManager, "process", "Geometry")
  await ProcessManager.prototype.setHeader.call(manager as unknown as ProcessManager, "process", true)
  assert.equal(events.length, unchangedEvents)
  assert.equal(echoes.length, unchangedEchoes)

  await ProcessManager.prototype.setHeader.call(manager as unknown as ProcessManager, "process", false)
  assert.equal(authority.header, false)
  assert.deepEqual(events.at(-1), ["process", "changeHeader", false])

  const resized = { width: "1/2", height: 260 }
  await ProcessManager.prototype.setGeometry.call(manager as unknown as ProcessManager, "process", { ...nextPosition, ...resized })
  assert.deepEqual(events.at(-1), ["process", "resize", resized])

  const publications: unknown[][] = []
  const counterpart = new ClientWindow(
      { $outbound: { async publish(...publication: unknown[]) { publications.push(publication); return [] } } } as unknown as ClientProcessManager,
      "process",
      authority.toJSON()
  )

  const synchronized = {
      ...authority.toJSON(),
      position: { x: "1/2", y: "0/1" },
      size: { width: "1/2", height: "1/1" }
  } as const
  const clientLink = new TheLink()
  const clientManager = new ClientProcessManager(clientLink as never, { processes: [] })
  clientManager.processes.set("process", { clientEndpoint: { window: counterpart } } as never)
  await clientLink.$inbound.publish("/process/set-geometry", { identity: "process", window: synchronized })
  assert.deepEqual(counterpart.position, synchronized.position)
  assert.deepEqual(counterpart.size, synchronized.size)

  await counterpart.setGeometry(next)
  assert.deepEqual(publications, [["/set-geometry", "process", next]])
  authority.minimized = true
  await ProcessManager.prototype.maximize.call(manager as unknown as ProcessManager, "process", true)
  assert.equal(authority.maximized, true)
  assert.equal(authority.minimized, true)
  assert.deepEqual(authority.position, nextPosition)
  assert.deepEqual(authority.size, resized)
  assert.deepEqual(events.at(-1), ["process", "maximize", true])
  const maximizedEvents = events.length
  await ProcessManager.prototype.maximize.call(manager as unknown as ProcessManager, "process", true)
  assert.equal(events.length, maximizedEvents)
  const stored = { x: 44, y: 55, width: 440, height: 550 }
  authority.setGeometry(stored)
  await ProcessManager.prototype.maximize.call(manager as unknown as ProcessManager, "process", false)
  assert.equal(authority.minimized, true)
  assert.equal(authority.maximized, false)
  assert.deepEqual(authority.position, { x: stored.x, y: stored.y })
  assert.deepEqual(authority.size, { width: stored.width, height: stored.height })
  await counterpart.maximize(true)
  assert.deepEqual(publications.at(-1), ["/maximize", "process", true])
  counterpart.follow(authority.toJSON())
  assert.equal(counterpart.maximized, false)
  assert.equal(counterpart.header, false)
}, 120_000)

test("the Desktop shows a standard Window on its plane, two views from the center, at most two views large", () => {
  const surface = { width: 1000, height: 600 }
  const inside = { x: "-1/2", y: 100 }
  const fitting = { width: "1/2", height: 300 }
  assert.deepEqual(boundedGeometry(inside, fitting, surface), { position: inside, size: fitting })
  assert.deepEqual(boundedGeometry({ x: 9000, y: -4000 }, { width: 500, height: 300 }, surface), { position: { x: 2000, y: -1500 }, size: { width: 500, height: 300 } })
  assert.deepEqual(boundedGeometry({ x: 1000, y: 0 }, { width: "3/1", height: 5000 }, surface), { position: { x: 500, y: 0 }, size: { width: 2000, height: 1200 } })
})

test.each([
  ["bottom", { top: 12, right: 12, bottom: 68, left: 12 }],
  ["right", { top: 12, right: 68, bottom: 12, left: 12 }]
] as const)("halves held against the edges divide the room equally with the Taskbar at the %s", (_, margins) => {
  const view = { width: 1440, height: 900 }
  const inset = 6
  const painted = (direction: { x: number, y: number }) => {
    const { position, size } = snapPlacement(direction, margins)
    const region = resolveWindowGeometry(position, size, view)
    const insets = windowPaintInsets(position, size, view, inset, margins)
    return { width: region.width - insets.left - insets.right, height: region.height - insets.top - insets.bottom, x: region.x + insets.left, y: region.y + insets.top }
  }
  const [top, bottom] = [painted({ x: 0, y: -1 }), painted({ x: 0, y: 1 })]
  const [left, right] = [painted({ x: -1, y: 0 }), painted({ x: 1, y: 0 })]
  expect(top.height).toBe(bottom.height)
  expect(left.width).toBe(right.width)
  // The gap between the halves is one spacing, as between any two Windows.
  expect(bottom.y - (top.y + top.height)).toBe(inset * 2)
  expect(right.x - (left.x + left.width)).toBe(inset * 2)
})
