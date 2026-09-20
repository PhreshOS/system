import assert from "node:assert/strict"
import ClientWindow from "@client/core/link-manager/auth-manager/process-manager/window"
import ProcessManager from "@server/core/link-manager/auth-manager/process-manager/process-manager"
import ServerWindow from "@server/core/link-manager/auth-manager/process-manager/window"
import type ClientProcessManager from "@client/core/link-manager/auth-manager/process-manager/process-manager"
import { test } from "vitest"

test("window geometry contract", async () => {
  const initial = {
      position: { x: 10, y: 20 },
      size: { width: 300, height: 200 }
  }

  const authority = new ServerWindow(
      { title: "Geometry", header: true, frame: true, transaction: false, layer: "window" },
      initial.position,
      initial.size,
      1,
      false
  )

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
  await ProcessManager.prototype.setGeometry.call(manager as unknown as ProcessManager, "process", next)
  await ProcessManager.prototype.move.call(manager as unknown as ProcessManager, "process", nextPosition)
  await ProcessManager.prototype.resize.call(manager as unknown as ProcessManager, "process", nextSize)
  await ProcessManager.prototype.setTitle.call(manager as unknown as ProcessManager, "process", "Geometry")
  await ProcessManager.prototype.setHeader.call(manager as unknown as ProcessManager, "process", true)
  assert.equal(events.length, unchangedEvents)

  await ProcessManager.prototype.setHeader.call(manager as unknown as ProcessManager, "process", false)
  assert.equal(authority.header, false)
  assert.deepEqual(events.at(-1), ["process", "changeHeader", false])

  const transaction = { duration: 240, easing: "ease-out" } as const
  await ProcessManager.prototype.setTransaction.call(manager as unknown as ProcessManager, "process", transaction)
  assert.deepEqual(authority.transaction, transaction)
  assert.deepEqual(events.at(-1), ["process", "changeTransaction", transaction])

  const resized = { width: "1/2", height: 260 }
  await ProcessManager.prototype.setGeometry.call(manager as unknown as ProcessManager, "process", { ...nextPosition, ...resized })
  assert.deepEqual(events.at(-1), ["process", "resize", resized])

  const publications: unknown[][] = []
  const counterpart = new ClientWindow(
      { $outbound: { async publish(...publication: unknown[]) { publications.push(publication); return [] } } } as unknown as ClientProcessManager,
      "process",
      authority.toJSON()
  )
  await counterpart.setGeometry(next)
  assert.deepEqual(publications, [["/set-geometry", "process", next]])
  await counterpart.setTransaction(false)
  assert.deepEqual(publications.at(-1), ["/set-transaction", "process", false])

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
