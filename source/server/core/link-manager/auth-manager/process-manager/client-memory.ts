import { randomUUID } from "node:crypto"
import { Buffer } from "node:buffer"
import type { JsonValue } from "@phreshos/core"

const maximumValueBytes = 16 * 1024
const maximumRunBytes = 64 * 1024

export type MemorySnapshot = Readonly<{ run: string, revision: number, value: JsonValue | undefined }>
export type MemoryChange = Readonly<{ key: string, snapshot: MemorySnapshot }>

/** The state of one Client execution, independent of every browser representation. */
export default class ClientMemoryState {
    public readonly run = randomUUID()

    private readonly values = new Map<string, { value: JsonValue, bytes: number }>()
    private readonly listeners = new Set<(change: MemoryChange) => void>()
    private revision = 0
    private totalBytes = 0
    private open = true

    public snapshot(key: string): MemorySnapshot {
        this.requireOpen()
        requireKey(key)
        return { run: this.run, revision: this.revision, value: clone(this.values.get(key)?.value) }
    }

    public entries(): readonly (readonly [string, JsonValue])[] {
        this.requireOpen()
        return [...this.values].map(([key, entry]) => [key, clone(entry.value) as JsonValue] as const)
    }

    public set(key: string, value: unknown): MemorySnapshot {
        this.requireOpen()
        requireKey(key)
        const json = jsonValue(value)
        const encoded = JSON.stringify(json)
        const bytes = Buffer.byteLength(key, "utf8") + Buffer.byteLength(encoded, "utf8")
        if (Buffer.byteLength(encoded, "utf8") > maximumValueBytes) throw new Error("A Client memory value exceeds 16 KiB")

        const previous = this.values.get(key)
        if (previous && JSON.stringify(previous.value) === encoded) return this.snapshot(key)
        if (this.totalBytes - (previous?.bytes ?? 0) + bytes > maximumRunBytes) throw new Error("Client memory exceeds 64 KiB")

        this.values.set(key, { value: json, bytes })
        this.totalBytes += bytes - (previous?.bytes ?? 0)
        this.revision++
        const snapshot = this.snapshot(key)
        this.emit({ key, snapshot })
        return snapshot
    }

    public compareAndSet(key: string, expected: { run: string, revision: number }, value: unknown) {
        this.requireOpen()
        requireKey(key)
        if (expected.run !== this.run || expected.revision !== this.revision) return { changed: false, snapshot: this.snapshot(key) } as const
        return { changed: true, snapshot: this.set(key, value) } as const
    }

    public delete(key: string): boolean {
        this.requireOpen()
        requireKey(key)
        const previous = this.values.get(key)
        if (!previous) return false
        this.values.delete(key)
        this.totalBytes -= previous.bytes
        this.revision++
        this.emit({ key, snapshot: this.snapshot(key) })
        return true
    }

    /** Delivers one coherent initial snapshot before later changes. */
    public subscribe(key: string, listener: (snapshot: MemorySnapshot) => void) {
        this.requireOpen()
        requireKey(key)
        const follow = (change: MemoryChange) => { if (change.key === key) listener(change.snapshot) }
        this.listeners.add(follow)
        listener(this.snapshot(key))
        return () => { this.listeners.delete(follow) }
    }

    public changes(listener: (change: MemoryChange) => void) {
        this.requireOpen()
        this.listeners.add(listener)
        return () => { this.listeners.delete(listener) }
    }

    public close() {
        this.open = false
        this.listeners.clear()
        this.values.clear()
        this.totalBytes = 0
    }

    private requireOpen() {
        if (!this.open) throw new Error("This Client run has stopped")
    }

    private emit(change: MemoryChange) {
        for (const listener of this.listeners) listener(change)
    }
}

function requireKey(key: unknown): asserts key is string {
    if (typeof key !== "string") throw new Error("A Client memory key must be text")
}

function jsonValue(value: unknown): JsonValue {
    const visited = new Set<object>()
    function valid(candidate: unknown): candidate is JsonValue {
        if (candidate === null || typeof candidate === "string" || typeof candidate === "boolean") return true
        if (typeof candidate === "number") return Number.isFinite(candidate)
        if (typeof candidate !== "object" || visited.has(candidate)) return false
        if (!Array.isArray(candidate) && Object.getPrototypeOf(candidate) !== Object.prototype && Object.getPrototypeOf(candidate) !== null) return false
        visited.add(candidate)
        const accepted = Array.isArray(candidate)
            ? Array.from({ length: candidate.length }, (_, index) => Object.hasOwn(candidate, index) && valid(candidate[index])).every(Boolean)
            : Object.keys(candidate).every(key => valid((candidate as Record<string, unknown>)[key]))
        visited.delete(candidate)
        return accepted
    }
    if (!valid(value)) throw new Error("A Client memory value must be JSON")
    return JSON.parse(JSON.stringify(value)) as JsonValue
}

function clone(value: JsonValue | undefined): JsonValue | undefined {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value)) as JsonValue
}
