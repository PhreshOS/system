import assert from "node:assert/strict"
import ClientWindow from "../source/client/core/link-manager/auth-manager/process-manager/window.ts"
import ProcessManager from "../source/server/core/link-manager/auth-manager/process-manager/process-manager.ts"
import ServerWindow from "../source/server/core/link-manager/auth-manager/process-manager/window.ts"

const initial = {
    position: { x: 10, y: 20 },
    size: { width: 300, height: 200 }
}

const authority = new ServerWindow(
    { title: "Geometry", url: null, layer: "window", location: "/" },
    initial.position,
    initial.size,
    1,
    false
)

assert.throws(() => authority.setGeometry({
    position: { x: 40, y: 50 },
    size: { width: Number.NaN, height: 240 }
}), /width/)
assert.deepEqual(authority.position, initial.position)
assert.deepEqual(authority.size, initial.size)

const next = {
    position: { x: "1/4", y: 30 },
    size: { width: "1/2", height: 240 }
}
const events = []
const echoes = []
const manager = {
    $outbound: {
        publish(...echo) {
            echoes.push(echo)
        }
    },
    mutableWindowOf(identity) {
        assert.equal(identity, "process")
        return authority
    },
    said(...event) {
        events.push(event)
    }
}

const echo = await ProcessManager.prototype.setGeometry.call(manager, "process", next)

assert.deepEqual(authority.position, next.position)
assert.deepEqual(authority.size, next.size)
assert.deepEqual(events, [
    ["process", "geometry", next],
    ["process", "move", next.position],
    ["process", "resize", next.size]
])
assert.deepEqual(echoes, [["/geometry", { identity: "process", window: authority }]])
assert.equal(echo.identity, "process")
assert.equal(echo.window, authority)

const publications = []
const counterpart = new ClientWindow(
    { $outbound: { publish: (...publication) => publications.push(publication) } },
    "process",
    authority.toJSON()
)
await counterpart.setGeometry(next)
assert.deepEqual(publications, [["/geometry", "process", next]])
