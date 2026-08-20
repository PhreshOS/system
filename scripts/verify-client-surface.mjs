import assert from "node:assert/strict"
import ClientProcessBoundary from "../source/client/view/desktop/client-host/client-process-boundary.ts"
import { surfaceSettings, visualTransaction } from "../source/client/view/desktop/client-host/local-window.ts"
import host from "../source/client/view/desktop/client-host/host.ts"
import LocalWindows from "../source/client/view/desktop/window-manager/local-windows.ts"
import ServerWindow from "../source/server/core/link-manager/auth-manager/process-manager/window.ts"

const authoritativeWindow = new ServerWindow(
    { title: "Target", url: null, layer: "over", location: "/" },
    { x: 0, y: 0 },
    { width: 100, height: 100 },
    1,
    false
)

assert.equal("surface" in authoritativeWindow, false)
assert.equal("surface" in authoritativeWindow.toJSON(), false)

const settings = surfaceSettings({ opacity: 0.5, radius: "large" })
const transaction = visualTransaction({ duration: 240, easing: "ease-out", wait: true })

assert.throws(() => surfaceSettings({ opacity: 2 }), /from 0 to 1/)
assert.throws(() => surfaceSettings({ radius: -1 }), /ScaleLevel/)
assert.throws(() => visualTransaction({}), /must provide duration or easing/)
assert.throws(() => visualTransaction({ wait: true }), /must provide duration or easing/)
assert.throws(() => visualTransaction({ duration: 60_001 }), /0 to 60000/)
assert.throws(() => surfaceSettings({ unknown: true }), /no "unknown" field/)

const ordinary = client("window")
const bare = client("over")
const clients = new Map([
    ["ordinary", { identity: "ordinary:0", client: ordinary }],
    ["bare", { identity: "bare:0", client: bare }]
])
const byProcess = new Map([["ordinary", ordinary], ["bare", bare]])
const first = new LocalWindows(clients, identity => byProcess.get(identity) ?? null)
const second = new LocalWindows(clients, identity => byProcess.get(identity) ?? null)

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
const matchingRevision = first.windows.get("ordinary:0").geometryAnimation.revision
ordinary.window.position = { x: 30, y: 40 }
first.reconcile(clients)
assert.equal(first.windows.get("ordinary:0").geometryAnimation.revision, matchingRevision)
first.complete("ordinary", "geometry", matchingRevision)
await matchingAuthority

const waiting = first.geometry("bare", {
    position: { x: 80, y: 90 },
    size: { width: 320, height: 240 }
}, transaction)
const geometryRevision = first.windows.get("bare:0").geometryAnimation.revision
first.complete("bare", "geometry", geometryRevision)
await waiting
assert.equal(first.windows.get("bare:0").geometryAnimation, null)

const interrupted = first.move("bare", { x: 100, y: 110 }, { duration: 200, wait: true })
await first.move("bare", { x: 120, y: 130 })
await assert.rejects(interrupted, /interrupted/)

const surfaceWaiting = first.setSurface("bare", settings, transaction)
const surfaceRevision = first.windows.get("bare:0").surface.animation.revision
first.complete("bare", "surface", surfaceRevision)
await surfaceWaiting
assert.equal(first.windows.get("bare:0").surface.animation, null)

assert.throws(() => first.setSurface("ordinary", settings), /window-layer/)
assert.equal(second.windows.get("bare:0").surface, null)

first.release("bare")
assert.deepEqual(first.state("bare").position, bare.window.position)
assert.equal(first.windows.get("bare:0").surface, null)

const removed = first.move("bare", { x: 140, y: 150 }, { duration: 200, wait: true })
first.reconcile(new Map([["ordinary", clients.get("ordinary")]]))
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
const calls = []
const localWindow = {
    state(identity) { return { position: identity === "target" ? { x: 70, y: 80 } : { x: 0, y: 0 } } },
    move(identity, value, motion) { calls.push(["move", identity, value, motion]) },
    setSurface(identity, value, motion) { calls.push(["set", identity, value, motion]) },
    removeSurface(identity) { calls.push(["remove", identity]) }
}
const authManager = {
    processManager: { processes },
    programManager: { programs: new Map() }
}
const request = host(authManager, requester.identity, () => ({ width: 1, height: 1 }), () => "owner", {}, localWindow)

assert.deepEqual(await request("desktop"), [{ width: 1, height: 1 }])
const targetAddress = { identity: target.identity, reference: target.reference }
assert.deepEqual(await request("windowLocal", targetAddress), [{ position: { x: 70, y: 80 } }])
await request("windowLocalMove", targetAddress, { x: 70, y: 80 })
await request("windowLocalSurfaceSet", targetAddress, settings, transaction)
await request("windowLocalSurfaceRemove", targetAddress)

assert.deepEqual(calls, [
    ["move", "target", { x: 70, y: 80 }, undefined],
    ["set", "target", settings, transaction],
    ["remove", "target"]
])
assert.deepEqual(target.client.window.position, { x: 10, y: 20 })
await assert.rejects(request("windowLocalSurfaceSet", targetAddress, { identity: "unexpected" }), /no "identity" field/)
await assert.rejects(request("windowLocalSurfaceSet", { ...targetAddress, reference: "wrong" }, settings), /does not know this process/)

const lifecycle = []
const boundary = new ClientProcessBoundary(
    "requester",
    { contentWindow: null },
    authManager,
    () => ({ width: 1, height: 1 }),
    {},
    {},
    { release(identity) { lifecycle.push(identity) } }
)

boundary.receive(["boundary", "document", "first-document"])
boundary.receive(["boundary", "document", "first-document"])
boundary.receive(["boundary", "document", "second-document"])
await boundary.release()

assert.deepEqual(lifecycle, ["requester", "requester"])

function client(layer) {
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
