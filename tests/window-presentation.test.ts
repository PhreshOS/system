import assert from "node:assert/strict"
import ClientProcessBoundary from "@client/view/components/desktop-host/client-process-boundary"
import { presentationTransaction } from "@client/view/components/desktop-host/window-presentation"
import WindowPresentations, { type WindowPresentationEntry } from "@client/view/components/window-manager/window-presentations"
import { requireWindowPresentationTransactions, windowLayerDefaults } from "@shared/window-layers"
import type { WindowLayer, WindowTransaction } from "@phreshos/core"
import { test } from "vitest"

test("Window presentation transactions remain independent from Appearance limits", () => {
  assert.deepEqual(presentationTransaction(true, false), { transaction: true, wait: false })
  assert.deepEqual(presentationTransaction(false, true), { transaction: false, wait: true })
  assert.deepEqual(presentationTransaction(120_000, true), { transaction: 120_000, wait: true })
  assert.deepEqual(presentationTransaction({ duration: 120_000, easing: "ease-out" }, false), {
      transaction: { duration: 120_000, easing: "ease-out" }, wait: false
  })
  assert.throws(() => presentationTransaction(-1, false), /non-negative/)
  assert.throws(() => presentationTransaction(true, "yes"), /true or false/)
  assert.doesNotThrow(() => requireWindowPresentationTransactions("under"))
  assert.doesNotThrow(() => requireWindowPresentationTransactions("over"))
  assert.doesNotThrow(() => requireWindowPresentationTransactions("window"))
  assert.doesNotThrow(() => requireWindowPresentationTransactions("shell"))
  assert.throws(() => requireWindowPresentationTransactions("wallpaper"), /does not support/)
})

test("each Desktop owns an independent Window presentation", async () => {
  const ordinary = client("window")
  const overlay = client("over")
  const entries = new Map([
      ["ordinary", { identity: "ordinary:0", client: ordinary }],
      ["overlay", { identity: "overlay:0", client: overlay }]
  ]) as unknown as ReadonlyMap<string, WindowPresentationEntry>
  const byProcess = new Map([["ordinary", ordinary], ["overlay", overlay]])
  const first = new WindowPresentations(entries, identity => byProcess.get(identity) as never ?? null)
  const second = new WindowPresentations(entries, identity => byProcess.get(identity) as never ?? null)

  await first.unfollow("ordinary")
  await first.move("ordinary", { x: 40, y: 50 })
  await first.move("overlay", { x: 60, y: 70 })

  assert.deepEqual(first.state("ordinary").position, { x: 40, y: 50 })
  assert.deepEqual(first.state("overlay").position, { x: 60, y: 70 })
  assert.deepEqual(second.state("ordinary").position, { x: 0, y: 0 })
  assert.deepEqual(ordinary.window.position, { x: 0, y: 0 })

  ordinary.window.position = { x: 15, y: 25 }
  overlay.window.position = { x: 20, y: 30 }
  first.reconcile(entries)

  assert.deepEqual(first.state("ordinary").position, { x: 40, y: 50 })
  assert.deepEqual(first.state("overlay").position, { x: 60, y: 70 })

  await first.follow("overlay")
  assert.deepEqual(first.state("overlay").position, { x: 20, y: 30 })
  overlay.window.position = { x: 80, y: 90 }
  first.reconcile(entries)
  assert.deepEqual(first.state("overlay").position, { x: 80, y: 90 })

  await first.unfollow("overlay")
  overlay.window.position = { x: 100, y: 110 }
  first.reconcile(entries)
  assert.deepEqual(first.state("overlay").position, { x: 80, y: 90 })
})

test("transactionAndWait semantics resolve on completion and reject on interruption", async () => {
  const overlay = client("over")
  const entries = new Map([
      ["overlay", { identity: "overlay:0", client: overlay }]
  ]) as unknown as ReadonlyMap<string, WindowPresentationEntry>
  const presentations = new WindowPresentations(entries, () => overlay as never)
  const request = { transaction: { duration: 200, easing: "ease-out" } as const, wait: true }

  const moving = presentations.move("overlay", { x: 30, y: 40 }, request)
  const revision = presentations.projection("overlay").geometryAnimation?.revision
  assert.equal(typeof revision, "number")
  presentations.complete("overlay", "geometry", revision!)
  await moving

  const interrupted = presentations.move("overlay", { x: 50, y: 60 }, request)
  await presentations.move("overlay", { x: 70, y: 80 })
  await assert.rejects(interrupted, /interrupted/)

  const changingSurface = presentations.setSurface("overlay", { color: "primary", radius: "full" }, request)
  const surfaceRevision = presentations.projection("overlay").surfaceAnimation?.revision
  presentations.complete("overlay", "surface", surfaceRevision!)
  await changingSurface
  assert.deepEqual(presentations.state("overlay").surface, { color: "primary", radius: "full" })
})

test("transaction-capable presentations use the authoritative Window transaction by default", async () => {
  const overlay = client("over")
  overlay.window.transaction = { duration: 240, easing: "ease-out" }
  const entries = new Map([
      ["overlay", { identity: "overlay:0", client: overlay }]
  ]) as unknown as ReadonlyMap<string, WindowPresentationEntry>
  const presentations = new WindowPresentations(entries, () => overlay as never)

  const first = presentations.move("overlay", { x: 20, y: 30 })
  const firstAnimation = presentations.projection("overlay").geometryAnimation
  assert.deepEqual(firstAnimation?.transaction, overlay.window.transaction)
  presentations.complete("overlay", "geometry", firstAnimation!.revision)
  await first

  overlay.window.transaction = false
  presentations.reconcile(entries)
  await presentations.move("overlay", { x: 40, y: 50 })
  assert.equal(presentations.projection("overlay").geometryAnimation, null)

  overlay.window.transaction = { duration: 180, easing: "linear" }
  presentations.reconcile(entries)
  const inherited = presentations.move("overlay", { x: 60, y: 70 }, { transaction: true, wait: true })
  const inheritedAnimation = presentations.projection("overlay").geometryAnimation
  assert.deepEqual(inheritedAnimation?.transaction, overlay.window.transaction)
  presentations.complete("overlay", "geometry", inheritedAnimation!.revision)
  await inherited
})

test("standard Window presentation uses its authoritative default transaction", async () => {
  const ordinary = client("window")
  ordinary.window.transaction = { duration: 160, easing: "ease-out" }
  const entries = new Map([
      ["ordinary", { identity: "ordinary:0", client: ordinary }]
  ]) as unknown as ReadonlyMap<string, WindowPresentationEntry>
  const presentations = new WindowPresentations(entries, () => ordinary as never)

  ordinary.window.position = { x: 80, y: 90 }
  presentations.reconcile(entries)
  assert.deepEqual(presentations.projection("ordinary").geometryAnimation?.transaction, ordinary.window.transaction)
})

test("standard Windows default to the shared Appearance transaction", () => {
  assert.equal(windowLayerDefaults("window").transaction, true)
  assert.equal(windowLayerDefaults("under").transaction, false)
  assert.equal(windowLayerDefaults("over").transaction, false)
  assert.equal(windowLayerDefaults("shell").transaction, false)
})

test("presentation state and events do not expose renderer measurements", () => {
  const ordinary = client("window")
  const entries = new Map([
      ["ordinary", { identity: "ordinary:0", client: ordinary }]
  ]) as unknown as ReadonlyMap<string, WindowPresentationEntry>
  const presentations = new WindowPresentations(entries, () => ordinary as never)
  const moves: unknown[] = []

  presentations.observe("ordinary", "move", (_event, value) => moves.push(value))
  presentations.represent("ordinary", {
      read: () => ({ x: 0, y: 0, width: 1200, height: 800 }),
      present() {},
      begin: () => null,
      finish() {},
      cancel() {}
  })

  // A maximized renderer may occupy the viewport, but those measurements are
  // not presentation values and cannot overwrite the retained geometry.
  ordinary.window.maximized = true
  presentations.reconcile(entries)
  assert.deepEqual(presentations.state("ordinary").position, { x: 0, y: 0 })
  assert.deepEqual(presentations.state("ordinary").size, { width: 300, height: 200 })
  assert.deepEqual(moves, [])

  ordinary.window.position = { x: 20, y: 30 }
  presentations.reconcile(entries)
  assert.deepEqual(moves, [{ x: 20, y: 30 }])
})

test("a Client boundary begins each document from authoritative presentation state without resetting on release", async () => {
  const lifecycle: string[] = []
  const boundary = new ClientProcessBoundary(
      "requester",
      { contentWindow: null } as unknown as HTMLIFrameElement,
      { processManager: { async ownFrame() {}, async releaseFrame() {} } } as never,
      () => ({ size: { width: 1, height: 1 } }),
      {} as never,
      { begin(identity: string) { lifecycle.push(identity) } } as never
  )

  await boundary.own("first-owner")
  await boundary.own("second-owner")
  await boundary.release()

  assert.deepEqual(lifecycle, ["requester", "requester"])
})

function client(layer: WindowLayer) {
  return {
      window: {
          title: "Window",
          header: layer === "window",
          surface: layer === "window",
          transaction: false as WindowTransaction,
          position: { x: 0, y: 0 },
          size: { width: 300, height: 200 },
          minimized: false,
          maximized: false,
          layer,
          depth: 1
      }
  }
}
