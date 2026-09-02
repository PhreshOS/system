import assert from "node:assert/strict"
import ClientProcessBoundary from "@client/view/components/desktop-host/client-process-boundary"
import ClientProcessManager from "@client/core/link-manager/auth-manager/process-manager/process-manager"
import { visualTransaction } from "@client/view/components/desktop-host/local-window"
import host from "@client/view/components/desktop-host/host"
import LocalWindows from "@client/view/components/window-manager/local-windows"
import type { LocalWindowEntry } from "@client/view/components/window-manager/local-windows"
import ServerWindow from "@server/core/link-manager/auth-manager/process-manager/window"
import type { LocalWindowState } from "@client/view/components/desktop-host/local-window"
import type { Transaction, WindowLayer } from "@phreshos/core"

const authoritativeWindow = new ServerWindow(
    { title: "Target", layer: "over", location: "/" },
    { x: 0, y: 0 },
    { width: 100, height: 100 },
    1,
    false
)

assert.equal("surface" in authoritativeWindow, false)
assert.equal("surface" in authoritativeWindow.toJSON(), false)

const transaction = visualTransaction({ duration: 240, easing: "ease-out", wait: true })
const visibility = visualTransaction({ duration: 240, easing: "ease-out", wait: true })!

assert.throws(() => visualTransaction({}), /must provide duration or easing/)
assert.throws(() => visualTransaction({ wait: true }), /must provide duration or easing/)
assert.throws(() => visualTransaction({ duration: 60_001 }), /0 to 60000/)
assert.throws(() => visualTransaction({ unknown: true }), /no "unknown" field/)

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

const matchingAuthority = first.move("ordinary", { x: 30, y: 40 }, { duration: 120, wait: true })
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

const interrupted = first.move("bare", { x: 100, y: 110 }, { duration: 200, wait: true })
await first.move("bare", { x: 120, y: 130 })
await assert.rejects(interrupted, /interrupted/)

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

const removed = first.move("bare", { x: 140, y: 150 }, { duration: 200, wait: true })
const remaining = clients.get("ordinary")
assert(remaining)
first.reconcile(new Map([["ordinary", remaining]]))
await assert.rejects(removed, /representation was removed/)

const requester = {
    identity: "requester",
    reference: "requester-reference",
    program: "program",
    client: { window: { process: "requester", layer: "over" } }
}
const target = {
    identity: "target",
    reference: "target-reference",
    program: "program",
    client: { window: { process: "target", layer: "over", position: { x: 10, y: 20 } } }
}
const processes = new Map([[requester.identity, requester], [target.identity, target]])
const calls: unknown[][] = []
const localWindow = {
    state(identity: string) { return { position: identity === "target" ? { x: 70, y: 80 } : { x: 0, y: 0 } } },
    move(identity: string, value: unknown, motion: Transaction | undefined) { calls.push(["move", identity, value, motion]) },
    addSurface(identity: string, motion: Transaction) { calls.push(["add", identity, motion]) },
    removeSurface(identity: string, motion: Transaction) { calls.push(["remove", identity, motion]) }
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
    programManager: { programs: new Map() },
}
const request = host(authManager as never, requester.identity, () => ({ size: { width: 1, height: 1 } }), () => "owner", localWindow as never)

assert.deepEqual(await request("desktopSurface"), [{ size: { width: 1, height: 1 } }])
const targetAddress = { identity: target.identity, reference: target.reference }
const requesterAddress = { identity: requester.identity, reference: requester.reference }
await request("windowLocalMove", requesterAddress, { x: 70, y: 80 })
await request("windowLocalSurfaceAdd", requesterAddress, undefined, visibility)
await request("windowLocalSurfaceRemove", requesterAddress, undefined, visibility)

assert.deepEqual(calls, [
    ["move", "requester", { x: 70, y: 80 }, undefined],
    ["add", "requester", visibility],
    ["remove", "requester", visibility]
])
assert.deepEqual(target.client.window.position, { x: 10, y: 20 })
await assert.rejects(request("windowLocalSurfaceAdd", requesterAddress, undefined, { identity: "unexpected" }), /no "identity" field/)
await assert.rejects(request("windowLocalSurfaceAdd", targetAddress), /current Client Context/)
await assert.rejects(request("windowLocalSurfaceAdd", { ...requesterAddress, reference: "wrong" }), /represented by this handle does not exist/)
requester.client.window.layer = "window"
await assert.rejects(request("windowLocalMove", requesterAddress, { x: 0, y: 0 }), /window-layer Process/)
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
            minimized: false,
            layer,
            location: "/",
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
