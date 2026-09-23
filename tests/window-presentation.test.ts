import assert from "node:assert/strict"
import ClientProcessBoundary from "@client/view/components/desktop-host/client-process-boundary"
import { presentationTransaction } from "@client/view/components/desktop-host/window-presentation"
import WindowPresentations, { type WindowPresentationEntry } from "@client/view/components/window-manager/window-presentations"
import type { WindowLayer } from "@phreshos/core"
import { test } from "vitest"

test("presentation transaction selection has no boolean compatibility values", () => {
  assert.deepEqual(presentationTransaction({ wait: false }), { wait: false })
  assert.deepEqual(presentationTransaction({ transaction: 120_000, wait: true }), { transaction: 120_000, wait: true })
  assert.deepEqual(presentationTransaction({ transaction: { duration: 240, easing: "ease-out" }, wait: false }), {
    transaction: { duration: 240, easing: "ease-out" }, wait: false
  })
  assert.throws(() => presentationTransaction({ transaction: true, wait: false }), /must be an object/)
  assert.throws(() => presentationTransaction({ wait: "yes" }), /true or false/)
})

test("each Desktop owns an independent raw presentation initialized at zero", async () => {
  const overlay = client("over")
  const entries = entry("overlay", overlay)
  const first = new WindowPresentations(entries, () => overlay as never)
  const second = new WindowPresentations(entries, () => overlay as never)

  assert.deepEqual(first.projection("overlay").position, { x: 0, y: 0 })
  assert.deepEqual(first.projection("overlay").size, { width: 0, height: 0 })
  assert.equal(first.projection("overlay").surface, false)

  await first.setGeometry("overlay", { x: 40, y: 50, width: 600, height: 400 })
  await first.setSurface("overlay", { color: "primary", radius: "full" })
  assert.deepEqual(first.projection("overlay").position, { x: 40, y: 50 })
  assert.deepEqual(second.projection("overlay").position, { x: 0, y: 0 })

  await first.setSurface("overlay", false)
  assert.equal(first.projection("overlay").surface, false)

  overlay.window.position = { x: 900, y: 900 }
  first.reconcile(entries)
  assert.deepEqual(first.projection("overlay").position, { x: 40, y: 50 })
})

test("transactionAndWait resolves only after the matching local animation", async () => {
  const overlay = client("over")
  const presentations = new WindowPresentations(entry("overlay", overlay), () => overlay as never)
  const request = { transaction: { duration: 200, easing: "ease-out" } as const, wait: true }

  const moving = presentations.move("overlay", { x: 30, y: 40 }, request)
  const animation = presentations.projection("overlay").geometryAnimation
  assert.deepEqual(animation?.transaction, request.transaction)
  presentations.complete("overlay", "geometry", animation!.revision)
  await moving

  const interrupted = presentations.move("overlay", { x: 50, y: 60 }, request)
  await presentations.move("overlay", { x: 70, y: 80 }, { wait: false })
  await assert.rejects(interrupted, /interrupted/)

  const usingAppearance = presentations.setSurface("overlay", true, { wait: true })
  const surface = presentations.projection("overlay").surfaceAnimation
  assert.equal(surface?.transaction, undefined)
  presentations.complete("overlay", "surface", surface!.revision)
  await usingAppearance
})

test("a standard Window follows authoritative state but accepts only move gestures", async () => {
  const ordinary = client("window")
  const entries = entry("ordinary", ordinary)
  const presentations = new WindowPresentations(entries, () => ordinary as never)

  ordinary.window.position = { x: 80, y: 90 }
  ordinary.window.size = { width: 500, height: 350 }
  presentations.reconcile(entries)
  assert.deepEqual(presentations.projection("ordinary").position, ordinary.window.position)
  assert.throws(() => presentations.move("ordinary", { x: 1, y: 2 }), /does not support raw/)
  assert.throws(() => presentations.setSurface("ordinary", false), /does not support raw/)

  const events: unknown[] = []
  let ready!: () => void
  let finish!: () => void
  presentations.registerMoveGesture("ordinary", {
    begin(origin, point) {
      events.push([origin, point])
      return {
        ready: new Promise<void>(resolve => { ready = resolve }),
        finished: new Promise<void>(resolve => { finish = resolve }),
        cancel() { events.push("gesture-cancel") }
      }
    },
    cancel() { events.push("cancel") }
  })
  const beginning = presentations.beginMoveGesture("ordinary", "gesture", { x: 10, y: 20 }, { x: 30, y: 40 })
  assert.deepEqual(events, [[{ x: 10, y: 20 }, { x: 30, y: 40 }]])
  ready()
  await beginning
  const moving = presentations.waitMoveGesture("ordinary", "gesture")
  finish()
  await moving
})

test("a Client boundary initializes each new document exactly once", async () => {
  const lifecycle: string[] = []
  const boundary = new ClientProcessBoundary(
    "requester",
    { contentWindow: null } as unknown as HTMLIFrameElement,
    { processManager: { async ownFrame() {}, async releaseFrame() {} } } as never,
    () => ({ size: { width: 1, height: 1 } }),
    {} as never,
    { begin(identity: string) { lifecycle.push(identity) }, cancelMoveGestures() {} } as never
  )
  await boundary.own("first-owner")
  await boundary.own("second-owner")
  await boundary.release()
  assert.deepEqual(lifecycle, ["requester", "requester"])
})

function entry(process: string, selected: ReturnType<typeof client>) {
  return new Map([[process, { identity: `${process}:0`, client: selected }]]) as unknown as ReadonlyMap<string, WindowPresentationEntry>
}

function client(layer: WindowLayer) {
  return {
    window: {
      title: "Window",
      header: layer === "window",
      position: { x: 10, y: 20 },
      size: { width: 300, height: 200 },
      minimized: false,
      maximized: false,
      layer,
      depth: 1
    }
  }
}
