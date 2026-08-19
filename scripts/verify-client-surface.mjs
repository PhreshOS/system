import assert from "node:assert/strict"
import ClientProcessBoundary from "../source/client/view/desktop/client-host/client-process-boundary.ts"
import { clientSurfaceSettings, removeClientSurface, setClientSurface } from "../source/client/view/desktop/client-host/client-surface.ts"
import host from "../source/client/view/desktop/client-host/host.ts"
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

const settings = clientSurfaceSettings({ opacity: 0.5, radius: "large", transaction: { duration: 240, easing: "ease-out" } })

let firstDesktop = new Map()
let secondDesktop = new Map()

firstDesktop = setClientSurface(firstDesktop, "target", settings)

assert.equal(firstDesktop.get("target")?.revision, 1)
assert.equal(secondDesktop.has("target"), false)
assert.equal(setClientSurface(firstDesktop, "target", settings), firstDesktop)

firstDesktop = removeClientSurface(firstDesktop, "target")

assert.equal(firstDesktop.has("target"), false)
assert.equal(removeClientSurface(firstDesktop, "target"), firstDesktop)

assert.throws(() => clientSurfaceSettings({ opacity: 2 }), /from 0 to 1/)
assert.throws(() => clientSurfaceSettings({ radius: -1 }), /ScaleLevel/)
assert.throws(() => clientSurfaceSettings({ transaction: { duration: 60_001 } }), /0 to 60000/)
assert.throws(() => clientSurfaceSettings({ unknown: true }), /no "unknown" field/)

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
    client: { window: { process: "target", layer: "under" } }
}

const processes = new Map([[requester.identity, requester], [target.identity, target]])
const calls = []
const surface = {
    set(identity, value) { calls.push(["set", identity, value]) },
    remove(identity) { calls.push(["remove", identity]) }
}

const authManager = {
    processManager: { processes },
    programManager: { programs: new Map() }
}

const request = host(authManager, requester.identity, () => ({ width: 1, height: 1 }), () => "owner", {}, surface)

await request("surfaceSet", { identity: target.identity, reference: target.reference }, settings)
await request("surfaceRemove", { identity: target.identity, reference: target.reference })

assert.deepEqual(calls, [["set", "target", settings], ["remove", "target"]])

target.client.window.layer = "window"

await assert.rejects(request("surfaceSet", { identity: target.identity, reference: target.reference }, {}), /window-layer/)

const lifecycle = []
const boundary = new ClientProcessBoundary(
    "target",
    { contentWindow: null },
    authManager,
    () => ({ width: 1, height: 1 }),
    {},
    {},
    { set() {}, remove(identity) { lifecycle.push(identity) } }
)

boundary.receive(["boundary", "document", "first-document"])
boundary.receive(["boundary", "document", "first-document"])
boundary.receive(["boundary", "document", "second-document"])
await boundary.release()

assert.deepEqual(lifecycle, ["target", "target"])
