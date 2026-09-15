import { createHash } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Keyv from "keyv"
import { afterEach, describe, expect, test, vi } from "vitest"
import SqliteStore from "@libs/sqlite-store"
import Sessions, { disconnectedSessionLifetime } from "@server/core/authentication/sessions"

const directories: string[] = []

afterEach(async () => {
    vi.useRealTimers()
    await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe("Session persistence and connection-bound lifetime", () => {
    test("persists only a token hash and resolves the Client-owned token", async () => {
        const { sessions, store } = await fixture()
        const created = await sessions.create()
        const hash = createHash("sha256").update(created.token).digest("base64url")

        expect(created.identity).not.toBe(created.token)
        expect(sessions.resolve(created.token)).toBe(created.identity)
        expect(sessions.find(created.identity)).toBeNull()
        expect(await store.get(`authentication:sessions:${hash}`)).toBeUndefined()
        expect(await sessions.expose(created.identity)).toBe(true)
        expect(sessions.find(created.identity)).toBe(created.identity)
        expect(await store.get(`authentication:sessions:${hash}`)).toEqual({
            identity: created.identity,
            disconnectedAt: expect.any(Number)
        })
        expect(await store.get(`authentication:sessions:${created.token}`)).toBeUndefined()

        await store.disconnect()
    })

    test("keeps a Session valid while any Connection remains attached", async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
        const { sessions, store } = await fixture()
        const created = await sessions.create()

        await sessions.attach(created.identity)
        await sessions.expose(created.identity)
        await sessions.attach(created.identity)
        await sessions.detach(created.identity)
        vi.advanceTimersByTime(disconnectedSessionLifetime * 2)

        expect(sessions.valid(created.identity)).toBe(true)
        expect(await persisted(store, created.token)).toEqual({
            identity: created.identity,
            disconnectedAt: null
        })

        await sessions.detach(created.identity)
        vi.advanceTimersByTime(disconnectedSessionLifetime + 1)

        expect(sessions.valid(created.identity)).toBe(false)
        expect(sessions.resolve(created.token)).toBeNull()

        await store.disconnect()
    })

    test("removes an explicitly signed-out Session", async () => {
        const { sessions, store } = await fixture()
        const created = await sessions.create()

        expect(await sessions.remove(created.identity)).toBe(true)
        expect(sessions.find(created.identity)).toBeNull()
        expect(sessions.resolve(created.token)).toBeNull()

        await store.disconnect()
    })
})

async function fixture() {
    const directory = await mkdtemp(join(tmpdir(), "phreshos-sessions-"))
    directories.push(directory)
    const store = new Keyv(new SqliteStore(join(directory, "store.sqlite")))
    return { sessions: await Sessions.open(store), store }
}

function persisted(store: Keyv, token: string) {
    const hash = createHash("sha256").update(token).digest("base64url")
    return store.get(`authentication:sessions:${hash}`)
}
