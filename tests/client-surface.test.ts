import assert from "node:assert/strict"
import ClientProcessBoundary from "@client/view/components/desktop-host/client-process-boundary"
import ClientProcessManager from "@client/core/link-manager/auth-manager/process-manager/process-manager"
import { parseLocalWindowTransaction } from "@client/view/components/desktop-host/local-window"
import host from "@client/view/components/desktop-host/host"
import LocalWindows from "@client/view/components/window-manager/local-windows"
import type { LocalWindowEntry } from "@client/view/components/window-manager/local-windows"
import ServerWindow from "@server/core/link-manager/auth-manager/process-manager/window"
import type { LocalWindowState } from "@client/view/components/desktop-host/local-window"
import type { AppearanceTransaction, WaitedTransaction, WindowLayer } from "@phreshos/core"
import { test } from "vitest"

test("client surface contract", async () => {
  type RequestedTransaction = AppearanceTransaction | WaitedTransaction

  const authoritativeWindow = new ServerWindow(
      { title: "Target", layer: "over" },
      { x: 0, y: 0 },
      { width: 100, height: 100 },
      1,
      false
  )

  assert.equal("surface" in authoritativeWindow, false)
  assert.equal("surface" in authoritativeWindow.toJSON(), false)

  const transaction = parseLocalWindowTransaction({ duration: 240, easing: "ease-out", wait: true })
  const visibility = parseLocalWindowTransaction({ duration: 240, easing: "ease-out", wait: true })!

  assert.throws(() => parseLocalWindowTransaction({}), /must provide duration and easing/)
  assert.throws(() => parseLocalWindowTransaction({ wait: true }), /must provide duration and easing/)
  assert.throws(() => parseLocalWindowTransaction({ duration: 60_001, easing: "linear" }), /0 to 60000/)
  assert.throws(() => parseLocalWindowTransaction({ duration: 120 }), /must provide duration and easing/)
  assert.throws(() => parseLocalWindowTransaction({ duration: 120, easing: "linear", wait: false }), /must be true/)
  assert.throws(() => parseLocalWindowTransaction({ unknown: true }), /no "unknown" field/)

  const ordinary = client("window")
  const bare = client("over")
  const clients = new Map([
      ["ordinary", { identity: "ordinary:0", client: ordinary }],
      ["bare", { identity: "bare:0", client: bare }]
  ]) as unknown as ReadonlyMap<string, LocalWindowEntry>
  const byProcess = new Map([["ordinary", ordinary], ["bare", bare]])
  const first = new LocalWindows(clients, identity => byProcess.get(identity) as never ?? null)
  const second = new LocalWindows(clients, identity => byProcess.get(identity) as never ?? null)

  await first.move("ordinary", { x: 40, y: 50 })
  await first.move("bare", { x: 60, y: 70 })

  assert.deepEqual(first.state("ordinary").position, { x: 40, y: 50 })
  assert.deepEqual(first.state("bare").position, { x: 60, y: 70 })
  assert.deepEqual(second.state("ordinary").position, { x: 0, y: 0 })
  assert.deepEqual(ordinary.window.position, { x: 0, y: 0 })

  // A reader reports the rectangle currently painted by the browser. Policy
  // such as fill/restore still needs the underlying projection, because a
  // relative full-surface value and its measured pixels are not equivalent.
  first.represent("ordinary", () => ({ position: { x: 0, y: 0 }, size: { width: 1200, height: 800 } }))
  assert.deepEqual(first.state("ordinary").size, { width: 1200, height: 800 })
  assert.deepEqual(first.projection("ordinary").size, { width: 300, height: 200 })
  first.represent("ordinary", null)

  first.represent("bare", () => ({ position: { x: 65, y: 75 }, size: { width: 290, height: 190 } }))
  assert.deepEqual(first.state("bare").position, { x: 65, y: 75 })
  assert.deepEqual(first.state("bare").size, { width: 290, height: 190 })
  first.represent("bare", null)

  // An unrelated full snapshot is not a Window change and must not erase a
  // local ordinary-window command.
  first.reconcile(clients)
  assert.deepEqual(first.state("ordinary").position, { x: 40, y: 50 })

  ordinary.window.position = { x: 15, y: 25 }
  bare.window.position = { x: 20, y: 30 }
  first.reconcile(clients)

  assert.deepEqual(first.state("ordinary").position, { x: 15, y: 25 })
  assert.deepEqual(first.state("bare").position, { x: 60, y: 70 })

  const matchingAuthority = first.move("ordinary", { x: 30, y: 40 }, { duration: 120, easing: "ease-out", wait: true })
  const matchingRevision = represented(first, "ordinary:0").geometryAnimation!.revision
  ordinary.window.position = { x: 30, y: 40 }
  first.reconcile(clients)
  assert.equal(represented(first, "ordinary:0").geometryAnimation!.revision, matchingRevision)
  first.complete("ordinary", "geometry", matchingRevision)
  await matchingAuthority

  const waiting = first.geometry("bare", {
      position: { x: 80, y: 90 },
      size: { width: 320, height: 240 }
  }, transaction)
  const geometryRevision = represented(first, "bare:0").geometryAnimation!.revision
  first.complete("bare", "geometry", geometryRevision)
  await waiting
  assert.equal(represented(first, "bare:0").geometryAnimation, null)

  const interrupted = first.move("bare", { x: 100, y: 110 }, { duration: 200, easing: "ease-out", wait: true })
  await first.move("bare", { x: 120, y: 130 })
  await assert.rejects(interrupted, /interrupted/)

  const following = first.follow("bare", "ordinary", transaction)
  const followRevision = represented(first, "bare:0").geometryAnimation!.revision
  first.reconcile(clients)
  assert.equal(represented(first, "bare:0").geometryAnimation!.revision, followRevision)
  first.complete("bare", "geometry", followRevision)
  await following
  assert.deepEqual(first.state("bare").position, first.state("ordinary").position)

  // Following reads authority, never another Desktop-local representation.
  await first.move("ordinary", { x: 150, y: 160 })
  assert.deepEqual(first.state("bare").position, ordinary.window.position)
  ordinary.window.position = { x: 170, y: 180 }
  first.reconcile(clients)
  assert.deepEqual(first.state("bare").position, { x: 170, y: 180 })

  await first.unfollow("bare", transaction)
  assert.deepEqual(first.state("bare").position, { x: 170, y: 180 })
  ordinary.window.position = { x: 190, y: 200 }
  first.reconcile(clients)
  assert.deepEqual(first.state("bare").position, { x: 170, y: 180 })

  // Default following can be disabled on ordinary windows and enabled on bare ones.
  await first.unfollow("ordinary")
  ordinary.window.position = { x: 210, y: 220 }
  first.reconcile(clients)
  assert.deepEqual(first.state("ordinary").position, { x: 190, y: 200 })
  await first.follow("ordinary", "ordinary")
  assert.deepEqual(first.state("ordinary").position, { x: 210, y: 220 })
  await first.follow("bare", "ordinary")
  await first.move("bare", { x: 125, y: 135 })
  ordinary.window.title = "Renamed"
  first.reconcile(clients)
  assert.equal(first.state("bare").title, "Renamed")
  assert.deepEqual(first.state("bare").position, { x: 125, y: 135 })
  ordinary.window.position = { x: 230, y: 240 }
  first.reconcile(clients)
  assert.deepEqual(first.state("bare").position, ordinary.window.position)

  // Stored geometry cannot cancel an in-progress maximize presentation.
  const maximizing = first.maximize("bare", true, transaction)
  const maximizeRevision = represented(first, "bare:0").geometryAnimation!.revision
  await first.move("bare", { x: 9, y: 10 }, transaction)
  assert.equal(represented(first, "bare:0").geometryAnimation!.revision, maximizeRevision)
  first.complete("bare", "geometry", maximizeRevision)
  await maximizing
  await first.maximize("bare", false)
  const toInterrupt = first.maximize("bare", true, transaction)
  await first.minimize("bare", true)
  await assert.rejects(toInterrupt, /was minimized/)
  await first.minimize("bare", false)
  await first.maximize("bare", false)

  // Minimize and maximize never overwrite the retained geometry or each other.
  await first.maximize("bare", true)
  await first.minimize("bare", true)
  await first.geometry("bare", { position: { x: 11, y: 12 }, size: { width: 111, height: 112 } }, transaction)
  assert.equal(first.projection("bare").geometryAnimation, null)
  assert.equal(first.state("bare").maximized, true)
  assert.equal(first.state("bare").minimized, true)
  await first.minimize("bare", false)
  assert.equal(first.state("bare").maximized, true)
  await first.maximize("bare", false)
  assert.deepEqual(first.state("bare").position, { x: 11, y: 12 })
  assert.deepEqual(first.state("bare").size, { width: 111, height: 112 })
  await first.follow("bare", "ordinary")
  ordinary.window.maximized = true
  ordinary.window.minimized = true
  first.reconcile(clients)
  assert.equal(first.state("bare").maximized, true)
  assert.equal(first.state("bare").minimized, true)
  ordinary.window.maximized = false
  ordinary.window.minimized = false
  first.reconcile(clients)

  const surfaceWaiting = first.addSurface("bare", visibility)
  const surfaceRevision = surface(first, "bare:0").transition!.revision
  first.complete("bare", "surface", surfaceRevision)
  await surfaceWaiting
  assert.equal(surface(first, "bare:0").transition, null)
  assert.equal(surface(first, "bare:0").visible, true)

  const surfaceRemoval = first.removeSurface("bare", visibility)
  const removalRevision = surface(first, "bare:0").transition!.revision
  assert.equal(surface(first, "bare:0").visible, false)
  first.complete("bare", "surface", removalRevision)
  await surfaceRemoval
  assert.equal(represented(first, "bare:0").surface, null)

  assert.equal(represented(second, "bare:0").surface, null)

  first.release("bare")
  assert.deepEqual(first.state("bare").position, bare.window.position)
  assert.equal(represented(first, "bare:0").surface, null)

  const removed = first.move("bare", { x: 140, y: 150 }, { duration: 200, easing: "ease-out", wait: true })
  const remaining = clients.get("ordinary")
  assert(remaining)
  first.reconcile(new Map([["ordinary", remaining]]))
  await assert.rejects(removed, /representation was removed/)

  const parent = {
      identity: "parent",
      reference: "parent-reference",
      name: "manager",
      program: "program",
      options: {},
      startedAt: new Date(),
      server: null,
      client: null
  }
  const requester = {
      identity: "requester",
      reference: "requester-reference",
      program: "program",
      parent,
      client: { window: { process: "requester", layer: "over" } }
  }
  const target = {
      identity: "target",
      reference: "target-reference",
      program: "program",
      client: { window: { process: "target", layer: "over", position: { x: 10, y: 20 } } }
  }
  const processes = new Map<string, object>([[parent.identity, parent], [requester.identity, requester], [target.identity, target]])
  const calls: unknown[][] = []
  const localWindow = {
      state(identity: string) { return { position: identity === "target" ? { x: 70, y: 80 } : { x: 0, y: 0 } } },
      move(identity: string, value: unknown, motion: RequestedTransaction | undefined) { calls.push(["move", identity, value, motion]) },
      follow(identity: string, followed: string, motion: RequestedTransaction | undefined) { calls.push(["follow", identity, followed, motion]) },
      unfollow(identity: string, motion: RequestedTransaction | undefined) { calls.push(["unfollow", identity, motion]) },
      addSurface(identity: string, motion: RequestedTransaction) { calls.push(["add", identity, motion]) },
      removeSurface(identity: string, motion: RequestedTransaction) { calls.push(["remove", identity, motion]) }
  }
  const processManager = {
      processes,
      front: ClientProcessManager.prototype.front,
      async ownFrame() {},
      async releaseFrame() {},
      async unsubscribeFrame() {}
  }
  const authManager = {
      processManager,
      programManager: { programs: new Map([["program", {
          reference: "program-reference",
          identity: "program",
          assetId: "00000000-0000-4000-8000-000000000000",
          installed: true,
          name: "Program",
          version: null,
          description: null,
          hasAgent: false,
          server: null,
          client: null
      }]]) },
  }
  const request = host(authManager as never, requester.identity, () => ({ size: { width: 1, height: 1 } }), () => "owner", localWindow as never)

  assert.deepEqual(await request("desktopViewport"), [{ size: { width: 1, height: 1 } }])
  const targetAddress = { identity: target.identity, reference: target.reference }
  const requesterAddress = { identity: requester.identity, reference: requester.reference }
  processes.delete(parent.identity)
  const parentAnswer = await request("parent", requesterAddress)
  assert(Array.isArray(parentAnswer))
  const retainedParent = parentAnswer[0] as { identity: string }
  assert.equal(retainedParent.identity, parent.identity)
  await request("windowLocalMove", requesterAddress, { x: 70, y: 80 })
  await request("windowLocalFollow", requesterAddress, targetAddress, visibility)
  await request("windowLocalUnfollow", requesterAddress, visibility)
  await request("windowLocalSurfaceAdd", requesterAddress, undefined, visibility)
  await request("windowLocalSurfaceRemove", requesterAddress, undefined, visibility)

  assert.deepEqual(calls, [
      ["move", "requester", { x: 70, y: 80 }, undefined],
      ["follow", "requester", "target", visibility],
      ["unfollow", "requester", visibility],
      ["add", "requester", visibility],
      ["remove", "requester", visibility]
  ])
  assert.deepEqual(target.client.window.position, { x: 10, y: 20 })
  await assert.rejects(request("windowLocalSurfaceAdd", requesterAddress, undefined, { identity: "unexpected" }), /no "identity" field/)
  await assert.rejects(request("windowLocalSurfaceAdd", targetAddress), /current Client Context/)
  await assert.rejects(request("windowLocalSurfaceAdd", { ...requesterAddress, reference: "wrong" }), /represented by this handle does not exist/)
  requester.client.window.layer = "window"
  await request("windowLocalMove", requesterAddress, { x: 0, y: 0 })
  await assert.rejects(request("windowLocalSurfaceAdd", requesterAddress), /already owns its host Surface/)
  await assert.rejects(request("windowLocalSurfaceRemove", requesterAddress), /already owns its host Surface/)
  requester.client.window.layer = "over"

  const lifecycle: string[] = []
  const boundary = new ClientProcessBoundary(
      "requester",
      { contentWindow: null } as unknown as HTMLIFrameElement,
      authManager as never,
      () => ({ size: { width: 1, height: 1 } }),
      {} as never,
      { release(identity: string) { lifecycle.push(identity) } } as never
  )

  await boundary.own("first-owner")
  await boundary.own("second-owner")
  await boundary.release()

  assert.deepEqual(lifecycle, ["requester", "requester"])

  function client(layer: WindowLayer) {
      return {
          window: {
              title: "Window",
              position: { x: 0, y: 0 },
              size: { width: 300, height: 200 },
              minimized: false, maximized: false,
              layer,
              depth: 1
          }
      }
  }

  function represented(windows: LocalWindows, identity: string): LocalWindowState {
      const value = windows.windows.get(identity)
      assert(value)
      return value
  }

  function surface(windows: LocalWindows, identity: string) {
      const value = represented(windows, identity).surface
      assert(value)
      return value
  }
}, 120_000)
