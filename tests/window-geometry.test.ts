import assert from "node:assert/strict"
import ClientWindow from "@client/core/link-manager/auth-manager/process-manager/window"
import ClientProcessManager from "@client/core/link-manager/auth-manager/process-manager/process-manager"
import ProcessManager from "@server/core/link-manager/auth-manager/process-manager/process-manager"
import ServerWindow from "@server/core/link-manager/auth-manager/process-manager/window"
import { boundedGeometry, constrainWindowGeometry, minimumWindowSize, planeGeometry, resolveWindowGeometry, shiftPosition, windowPaintInsets } from "@client/view/components/window-manager/window-geometry"
import { defaultAppearance } from "@phreshos/core"
import { TheLink } from "@the-link/core"
import { test } from "vitest"

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

test("an offset moves a position by pixels and keeps the share of the surface it names", () => {
  assert.deepEqual(shiftPosition({ x: 120, y: -40 }, { x: 1000, y: 0 }), { x: 1120, y: -40 })
  assert.deepEqual(shiftPosition({ x: "-1/2", y: "0/1" }, { x: 1416, y: -820 }), { x: "-50% + 1416", y: -820 })
  assert.deepEqual(shiftPosition({ x: "-50% + 1416", y: 10 }, { x: -1416, y: 0 }), { x: "-50% + 0", y: 10 })

  // What a Desktop shows with its offset returns to the plane unchanged.
  const surface = { width: 1200, height: 800 }
  const stored = { x: "-1/2 + 2400", y: 100 }
  const offset = { x: 2400, y: 0 }
  const shown = resolveWindowGeometry(shiftPosition(stored, { x: -offset.x, y: -offset.y }), { width: 600, height: 400 }, surface)
  assert.deepEqual(shown, { x: 0, y: 500, width: 600, height: 400 })
  const recorded = planeGeometry(shown, surface)
  assert.deepEqual({ x: recorded.x + offset.x, y: recorded.y + offset.y }, { x: 1800, y: 100 })
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

test("tiled standard windows share the Appearance gap inside the equally inset surface", () => {
  const surface = { width: 1000, height: 600 }
  const half = defaultAppearance.spacing / 2
  const left = windowPaintInsets({ x: "-1/2", y: "-1/2" }, { width: "1/2", height: "1/1" }, surface, half)
  const right = windowPaintInsets({ x: 0, y: "-1/2" }, { width: "1/2", height: "1/1" }, surface, half)

  assert.deepEqual(left, { top: 0, right: half, bottom: 0, left: 0 })
  assert.deepEqual(right, { top: 0, right: 0, bottom: 0, left: half })
  assert.equal(left.right + right.left, defaultAppearance.spacing)
})

test("settling paint follows released geometry instead of its former boundary contacts", () => {
  const surface = { width: 1000, height: 600 }
  const half = defaultAppearance.spacing / 2
  const released = { x: 120, y: 90, width: 500, height: 300 }
  const former = windowPaintInsets({ x: "-1/2", y: "-1/2" }, { width: 500, height: 300 }, surface, half)

  assert.deepEqual(former, { top: 0, right: half, bottom: half, left: 0 })

  assert.deepEqual(
      windowPaintInsets({ x: "-1/2", y: "-1/2" }, { width: 500, height: 300 }, surface, half, released),
      { top: half, right: half, bottom: half, left: half }
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
