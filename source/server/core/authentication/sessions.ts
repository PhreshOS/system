import Keyv from "keyv"
import { createHash, randomBytes } from "node:crypto"
import shortIdentity from "@libs/short-identity"

const storagePrefix = "authentication:sessions:"

/** How long a Session remains valid without an attached Connection. */
export const disconnectedSessionLifetime = 24 * 60 * 60 * 1_000

/** Persistent Session state and its transient live-connection count. */
export default class Sessions {

    private readonly identities = new Map<string, StoredSession>()

    private readonly hashes = new Map<string, StoredSession>()

    private readonly expirationListeners = new Set<(identity: string, createdAt: Date) => void>()

    private constructor(private readonly store: Keyv) {}

    public static async open(store: Keyv) {

        if (!store.iterator) throw new Error("The System store cannot enumerate authentication Sessions")

        const sessions = new Sessions(store)

        for await (const [key, value] of store.iterator(store.namespace)) {

            if (typeof key !== "string" || !key.startsWith(storagePrefix)) continue

            const hash = key.slice(storagePrefix.length)

            const record = parse(value, hash)

            // A Session stored without its sign-in time is not one this System can describe; the
            // owner signs in again.
            if (!record || sessions.expired(record, Date.now())) {

                await store.delete(key)

                continue
            }

            sessions.identities.set(record.identity, record)
            sessions.hashes.set(record.hash, record)
        }

        return sessions
    }

    /** Creates one Session and returns the raw token exactly once. */
    public async create(): Promise<CreatedSession> {

        await this.prune()

        const token = randomBytes(32).toString("base64url")

        const record: StoredSession = {

            identity: shortIdentity(),

            hash: hashToken(token),

            exposed: false,

            createdAt: Date.now(),

            disconnectedAt: Date.now(),

            connections: 0
        }

        this.identities.set(record.identity, record)
        this.hashes.set(record.hash, record)

        await this.persist(record)

        return { identity: record.identity, token }
    }

    /** Resolves a Client-owned raw token to a valid Session identity. */
    public resolve(token: string) {

        const record = this.hashes.get(hashToken(token))

        if (!record || !this.valid(record.identity)) return null

        return record.identity
    }

    /** Returns every valid browser Session. */
    public list() {

        return [...this.identities.values()]

            .filter(record => record.exposed && this.valid(record.identity))

            .map(record => record.identity)
    }

    /** Resolves one valid browser Session by its public identity. */
    public find(identity: string) {

        const record = this.identities.get(identity)

        return record && record.exposed && this.valid(identity) ? identity : null
    }

    /** Makes one completely established browser Session publicly discoverable. */
    public async expose(identity: string) {

        const record = this.identities.get(identity)

        if (!record || !this.valid(identity)) return false

        record.exposed = true

        await this.persist(record)

        return true
    }

    /** When one known Session signed in, and when it was last used: now while a Connection uses it. */
    public describe(identity: string) {

        const record = this.identities.get(identity)

        if (!record) return null

        return { createdAt: new Date(record.createdAt), lastActiveAt: new Date(record.connections > 0 ? Date.now() : record.disconnectedAt ?? Date.now()) }
    }

    /** Whether one Session still exists and can authorize a Connection. */
    public valid(identity: string) {

        const record = this.identities.get(identity)

        if (!record) return false

        if (this.validRecord(record, Date.now())) return true

        this.forget(record)
        this.expiredSession(record)
        this.store.delete(this.key(record.hash)).catch(() => undefined)

        return false
    }

    /** Observes browser Sessions removed by disconnected-lifetime expiration. */
    public onExpire(listener: (identity: string, createdAt: Date) => void) {

        this.expirationListeners.add(listener)

        return () => this.expirationListeners.delete(listener)
    }

    /** Attaches one live connection to a valid Session. */
    public async attach(identity: string) {

        if (!this.valid(identity)) return false

        const record = this.identities.get(identity)!

        record.connections += 1
        record.disconnectedAt = null

        await this.persist(record)

        return true
    }

    /** Detaches one live connection and records the normal disconnection time. */
    public async detach(identity: string) {

        const record = this.identities.get(identity)

        if (!record) return

        record.connections = Math.max(0, record.connections - 1)
        record.disconnectedAt = record.connections === 0 ? Date.now() : null

        await this.persist(record)
    }

    /** Permanently removes one Session and returns when it signed in, or `null` when it was unknown. */
    public async remove(identity: string) {

        const record = this.identities.get(identity)

        if (!record) return null

        this.forget(record)

        await this.store.delete(this.key(record.hash))

        return new Date(record.createdAt)
    }

    private validRecord(record: StoredSession, now: number) {

        return record.connections > 0

            || record.disconnectedAt === null

            || now - record.disconnectedAt <= disconnectedSessionLifetime
    }

    private expired(record: StoredSession, now: number) {

        return record.connections === 0

            && record.disconnectedAt !== null

            && now - record.disconnectedAt > disconnectedSessionLifetime
    }

    private async prune() {

        const now = Date.now()

        const expired = [...this.identities.values()].filter(record => this.expired(record, now))

        for (const record of expired) {

            this.forget(record)
            this.expiredSession(record)
        }

        await Promise.all(expired.map(record => this.store.delete(this.key(record.hash))))
    }

    private persist(record: StoredSession) {

        if (!record.exposed) return Promise.resolve(true)

        return this.store.set(this.key(record.hash), {

            identity: record.identity,

            createdAt: record.createdAt,

            disconnectedAt: record.disconnectedAt
        })
    }

    private forget(record: StoredSession) {

        this.identities.delete(record.identity)
        this.hashes.delete(record.hash)
    }

    private expiredSession(record: StoredSession) {

        for (const listener of this.expirationListeners) listener(record.identity, new Date(record.createdAt))
    }

    private key(hash: string) { return storagePrefix + hash }
}

function hashToken(token: string) {

    return createHash("sha256").update(token).digest("base64url")
}

function parse(value: unknown, hash: string): StoredSession | null {

    if (!value || typeof value !== "object") throw new Error("An authentication Session is invalid")

    const record = value as { identity?: unknown, createdAt?: unknown, disconnectedAt?: unknown }

    if (record.createdAt === undefined) return null

    if (typeof record.identity !== "string"

        || typeof record.createdAt !== "number" || !Number.isFinite(record.createdAt)

        || record.disconnectedAt !== null && (typeof record.disconnectedAt !== "number" || !Number.isFinite(record.disconnectedAt))) {

        throw new Error("An authentication Session is invalid")
    }

    return {

        identity: record.identity,

        hash,

        exposed: true,

        createdAt: record.createdAt,

        disconnectedAt: record.disconnectedAt,

        connections: 0
    }
}

interface StoredSession {

    identity: string

    hash: string

    exposed: boolean

    createdAt: number

    disconnectedAt: number | null

    connections: number
}

export type CreatedSession = Readonly<{

    identity: string

    token: string
}>
