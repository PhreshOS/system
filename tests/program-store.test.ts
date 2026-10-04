import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import ProgramStoreState, { type StoreSnapshot } from "../source/server/core/link-manager/auth-manager/program-manager/program-store.js"

const opened: Array<{ directory: string, store: ProgramStoreState }> = []

function store() {
    const directory = mkdtempSync(join(tmpdir(), "phresh-program-store-"))
    const changes: Array<{ key: string, snapshot: StoreSnapshot }> = []
    const instance = new ProgramStoreState(directory, (key, snapshot) => changes.push({ key, snapshot }))
    opened.push({ directory, store: instance })
    return { instance, changes }
}

afterEach(async () => {
    for (const { directory, store } of opened.splice(0)) {
        await store.disconnect()
        rmSync(directory, { recursive: true, force: true })
    }
})

describe("ProgramStoreState", () => {
    it("seeds only an absent key, including when an existing value is undefined", async () => {
        const { instance, changes } = store()
        expect((await instance.getOrSet("tab", "colors")).value).toBe("colors")
        expect((await instance.getOrSet("tab", "layout")).value).toBe("colors")
        await instance.set("optional", undefined)
        expect((await instance.getOrSet("optional", "replacement")).value).toBeUndefined()
        expect(await instance.has("optional")).toBe(true)
        expect(changes.filter(change => change.key === "tab")).toHaveLength(1)
    })

    it("initializes one missing key atomically across competing snapshots", async () => {
        const { instance, changes } = store()
        const initial = await instance.snapshot("tab")
        const [first, second] = await Promise.all([
            instance.compareAndSet("tab", "colors", initial),
            instance.compareAndSet("tab", "layout", initial)
        ])

        expect([first.changed, second.changed].sort()).toEqual([false, true])
        expect(await instance.get("tab")).toBe(first.changed ? "colors" : "layout")
        expect(changes).toHaveLength(1)
        expect(changes[0]?.snapshot.revision).toBe(1)
    })

    it("publishes changes for set, delete, clear, and TTL expiry", async () => {
        const { instance, changes } = store()
        await instance.snapshot("tab")
        await instance.set("tab", "colors")
        await instance.delete("tab")
        await instance.set("tab", "layout")
        await instance.clear()
        await instance.set("tab", "temporary", 1000)

        await vi.waitFor(() => expect(changes.map(change => change.snapshot.value)).toEqual([
            "colors", undefined, "layout", undefined, "temporary", undefined
        ]), { timeout: 4000 })
        expect(await instance.get("tab")).toBeUndefined()
    })

    it("preserves an existing expiry when a compare-and-set changes its value", async () => {
        const { instance, changes } = store()
        await instance.set("count", 1, 1000)
        const snapshot = await instance.snapshot("count")
        expect((await instance.compareAndSet("count", 2, snapshot)).changed).toBe(true)
        await vi.waitFor(async () => {
            expect(await instance.get("count")).toBeUndefined()
            expect(changes.at(-1)?.snapshot.value).toBeUndefined()
        }, { timeout: 4000 })
    })

    it("recovers a persisted deadline and notifies when that key expires", async () => {
        const directory = mkdtempSync(join(tmpdir(), "phresh-program-store-restart-"))
        const first = new ProgramStoreState(directory, () => undefined)
        try {
            // Long enough to outlast closing and reopening the store on a slow machine.
            await first.set("session", "live", 2_000)
            await first.disconnect()
            const changes: StoreSnapshot[] = []
            const second = new ProgramStoreState(directory, (_key, snapshot) => changes.push(snapshot))
            try {
                expect((await second.snapshot("session")).value).toBe("live")
                await vi.waitFor(() => {
                    expect(changes).toHaveLength(1)
                    expect(changes[0]?.value).toBeUndefined()
                }, { timeout: 8000 })
            } finally { await second.disconnect() }
        } finally { rmSync(directory, { recursive: true, force: true }) }
    })
})
