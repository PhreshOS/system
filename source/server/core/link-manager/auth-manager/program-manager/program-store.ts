import { randomUUID } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import openStore from "@server/core/open-store"

export type StoreSnapshot = Readonly<{ run: string, revision: number, value: unknown }>
export type StoreComparison = Readonly<{ changed: boolean, snapshot: StoreSnapshot }>

type Stored = Readonly<{ value: unknown, expires?: number }>
const maximumTimer = 2_147_483_647

/** Serializes one Program's writes and publishes only authoritative store changes. */
export default class ProgramStoreState {
    private readonly store
    private readonly runId = randomUUID()
    private readonly revisions = new Map<string, number>()
    private readonly known = new Set<string>()
    private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
    private queued: Promise<void> = Promise.resolve()

    public constructor(directory: string, private readonly changed: (key: string, snapshot: StoreSnapshot) => void) {
        this.store = openStore(directory)
    }

    public get(key: string) { return this.enqueue(async () => (await this.read(key))?.value) }

    public has(key: string) { return this.enqueue(async () => (await this.read(key)) !== undefined) }

    public snapshot(key: string) {
        return this.enqueue(async () => this.current(key, await this.read(key)))
    }

    public set(key: string, value: unknown, ttl?: number) {
        return this.enqueue(async () => {
            const previous = await this.read(key)
            const result = await this.store.set(key, value, ttl)
            const next = await this.read(key)
            if (!isDeepStrictEqual(previous, next)) this.publish(key, next)
            return result
        })
    }

    public getOrSet(key: string, initial: unknown) {
        return this.enqueue(async () => {
            const existing = await this.read(key)
            if (existing) return this.current(key, existing)
            await this.store.set(key, initial)
            const stored = await this.read(key)
            this.publish(key, stored)
            return this.current(key, stored)
        })
    }

    public compareAndSet(key: string, value: unknown, expected: Pick<StoreSnapshot, "run" | "revision">): Promise<StoreComparison> {
        return this.enqueue(async () => {
            const previous = await this.read(key)
            const snapshot = this.current(key, previous)
            if (expected?.run !== snapshot.run || expected.revision !== snapshot.revision) return { changed: false, snapshot }
            if (previous && isDeepStrictEqual(previous.value, value)) return { changed: true, snapshot }

            // An update must not silently turn an expiring value into durable state.
            const ttl = previous?.expires === undefined ? undefined : Math.max(1, previous.expires - Date.now())
            await this.store.set(key, value, ttl)
            const next = await this.read(key)
            this.publish(key, next)
            return { changed: true, snapshot: this.current(key, next) }
        })
    }

    public delete(keys: string | string[]) {
        return this.enqueue(async () => {
            let deleted = false
            for (const key of new Set(Array.isArray(keys) ? keys : [keys])) {
                const previous = await this.read(key)
                if (!previous) continue
                if (await this.store.delete(key)) {
                    deleted = true
                    this.known.delete(key)
                    this.cancel(key)
                    this.publish(key, undefined)
                }
            }
            return deleted
        })
    }

    public clear() {
        return this.enqueue(async () => {
            const keys = [...this.known.keys()]
            await this.store.clear()
            for (const key of keys) {
                if (!this.known.has(key)) continue
                this.known.delete(key)
                this.cancel(key)
                this.publish(key, undefined)
            }
        })
    }

    public async disconnect() {
        await this.queued
        for (const key of this.timers.keys()) this.cancel(key)
        await this.store.disconnect()
    }

    private current(key: string, stored: Stored | undefined): StoreSnapshot {
        return { run: this.runId, revision: this.revisions.get(key) ?? 0, value: stored?.value }
    }

    private async read(key: string): Promise<Stored | undefined> {
        const raw = await this.store.getRaw(key)
        const stored = raw === undefined ? undefined : { value: raw.value, expires: raw.expires ?? undefined }
        if (stored) {
            this.known.add(key)
            this.schedule(key, stored.expires)
        } else {
            this.cancel(key)
            if (this.known.delete(key)) this.publish(key, undefined)
        }
        return stored
    }

    private schedule(key: string, expires?: number) {
        this.cancel(key)
        if (expires === undefined) return
        const delay = Math.min(maximumTimer, Math.max(1, expires - Date.now() + 1))
        const timer = setTimeout(() => {
            this.timers.delete(key)
            void this.enqueue(() => this.read(key)).catch(() => undefined)
        }, delay)
        timer.unref?.()
        this.timers.set(key, timer)
    }

    private cancel(key: string) {
        const timer = this.timers.get(key)
        if (timer) clearTimeout(timer)
        this.timers.delete(key)
    }

    private publish(key: string, stored: Stored | undefined) {
        const revision = (this.revisions.get(key) ?? 0) + 1
        this.revisions.set(key, revision)
        this.changed(key, { run: this.runId, revision, value: stored?.value })
    }

    private enqueue<Result>(operation: () => Promise<Result>): Promise<Result> {
        const running = this.queued.then(operation)
        this.queued = running.then(() => undefined, () => undefined)
        return running
    }
}
