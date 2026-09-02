import assert from "node:assert/strict"
import ClientWindow from "@client/core/link-manager/auth-manager/process-manager/window"
import ProcessManager from "@server/core/link-manager/auth-manager/process-manager/process-manager"
import ServerWindow from "@server/core/link-manager/auth-manager/process-manager/window"
import type ClientProcessManager from "@client/core/link-manager/auth-manager/process-manager/process-manager"

const initial = {
    position: { x: 10, y: 20 },
    size: { width: 300, height: 200 }
}

const authority = new ServerWindow(
    { title: "Geometry", layer: "window", location: "/" },
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

const publications: unknown[][] = []
const counterpart = new ClientWindow(
    { $outbound: { async publish(...publication: unknown[]) { publications.push(publication); return [] } } } as unknown as ClientProcessManager,
    "process",
    authority.toJSON()
)
await counterpart.setGeometry(next)
assert.deepEqual(publications, [["/geometry", "process", next]])
