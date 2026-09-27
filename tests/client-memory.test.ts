import assert from "node:assert/strict"
import { test } from "vitest"
import ClientMemoryState from "@server/core/link-manager/auth-manager/process-manager/client-memory"

test("one Client run shares live values and an atomic revision", () => {
    const memory = new ClientMemoryState()
    const first: unknown[] = []
    const second: unknown[] = []
    const stopFirst = memory.subscribe("tab", snapshot => first.push(snapshot.value))
    const stopSecond = memory.subscribe("tab", snapshot => second.push(snapshot.value))
    assert.deepEqual(first, [undefined])
    assert.deepEqual(second, [undefined])

    const initial = memory.snapshot("tab")
    assert.equal(memory.compareAndSet("tab", initial, "colors").changed, true)
    assert.equal(memory.compareAndSet("tab", initial, "old").changed, false)
    assert.deepEqual(first, [undefined, "colors"])
    assert.deepEqual(second, [undefined, "colors"])
    assert.deepEqual(memory.entries(), [["tab", "colors"]])

    stopFirst()
    memory.delete("tab")
    assert.deepEqual(first, [undefined, "colors"])
    assert.deepEqual(second, [undefined, "colors", undefined])
    stopSecond()

    memory.close()
    assert.throws(() => memory.snapshot("tab"), /stopped/)
    assert.deepEqual(new ClientMemoryState().entries(), [])
})

test("Client memory enforces JSON and both byte limits without partial writes", () => {
    const memory = new ClientMemoryState()
    assert.throws(() => memory.set("invalid", undefined), /JSON/)
    assert.throws(() => memory.set("invalid", [undefined]), /JSON/)
    assert.throws(() => memory.set("invalid", new Array(1)), /JSON/)
    assert.throws(() => memory.set("large", "x".repeat(16 * 1024)), /16 KiB/)
    for (let index = 0; index < 4; index++) memory.set(String(index), "x".repeat(15 * 1024))
    assert.throws(() => memory.set("fifth", "x".repeat(5 * 1024)), /64 KiB/)
    assert.equal(memory.entries().length, 4)
})
