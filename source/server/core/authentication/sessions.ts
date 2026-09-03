import Keyv from "keyv"
import { randomUUID } from "node:crypto"

const storageKey = "authentication:sessions"

/** How long an authentication session survives without a live connection. */
export const disconnectedSessionLifetime = 24 * 60 * 60 * 1_000

/**
 * Durable authentication sessions, independent of transient desktop links.
 *
 * A session remains valid while at least one connection holds it. Ordinary
 * sessions receive a reconnecting grace period; owner-local sessions are
 * removed with their final connection because no reusable token leaves that
 * boundary.
 */
export default class Sessions {

    private readonly store: Keyv

    private readonly sessions: Map<string, StoredSession>

    private writing: Promise<unknown> = Promise.resolve()

    private constructor(store: Keyv, sessions: Map<string, StoredSession>) {

        this.store = store

        this.sessions = sessions
    }

    public static async open(store: Keyv) {

        const stored = parse(await store.get(storageKey))

        const now = Date.now()

        const sessions = new Map<string, StoredSession>()

        let changed = false

        for (const record of stored) {

            // No connections survive a host restart. A record that was live
            // when the host stopped becomes disconnected when this host opens.
            const disconnectedAt = record.disconnectedAt ?? now

            if (disconnectedAt !== record.disconnectedAt) changed = true

            if (now - disconnectedAt > disconnectedSessionLifetime) {

                changed = true

                continue
            }

            const owner = record.owner === true

            if (record.owner === undefined) changed = true

            sessions.set(record.identity, { identity: record.identity, owner, disconnectedAt })
        }

        const opened = new Sessions(store, sessions)

        if (changed) await opened.persist()

        return opened
    }

    /** Creates a session which has not yet acquired a connection. */
    public async create(owner = false) {

        this.prune(Date.now())

        const identity = randomUUID()

        this.sessions.set(identity, { identity, owner, disconnectedAt: Date.now() })

        await this.persist()

        return identity
    }

    /** Whether the session exists and has not exhausted its disconnected day. */
    public valid(identity: string) {

        const session = this.sessions.get(identity)

        if (!session) return false

        if (session.disconnectedAt === null || Date.now() - session.disconnectedAt <= disconnectedSessionLifetime) return true

        this.sessions.delete(identity)

        this.persist().catch(() => undefined)

        return false
    }

    /** Whether this session represents a trusted owner-local connection. */
    public owner(identity: string) {

        return this.valid(identity) && this.sessions.get(identity)!.owner
    }

    /** Resumes a valid session and removes its disconnected deadline. */
    public async connect(identity: string) {

        if (!this.valid(identity)) return false

        const session = this.sessions.get(identity)!

        if (session.disconnectedAt === null) return true

        session.disconnectedAt = null

        await this.persist()

        return true
    }

    /** Starts the grace period after the session's final connection is lost. */
    public async disconnect(identity: string) {

        const session = this.sessions.get(identity)

        if (!session) return

        session.disconnectedAt = Date.now()

        await this.persist()
    }

    /** Revokes a session immediately, independently of its connections. */
    public async remove(identity: string) {

        if (!this.sessions.delete(identity)) return

        await this.persist()
    }

    private persist() {

        const snapshot = [...this.sessions.values()].map(session => ({ ...session }))

        const writing = this.writing.catch(() => undefined).then(() => this.store.set(storageKey, snapshot))

        this.writing = writing

        return writing
    }

    private prune(now: number) {

        for (const [identity, session] of this.sessions) {

            if (session.disconnectedAt !== null && now - session.disconnectedAt > disconnectedSessionLifetime) this.sessions.delete(identity)
        }
    }
}

function parse(value: unknown): StoredSessionInput[] {

    if (value === undefined) return []

    if (!Array.isArray(value) || !value.every(isStoredSession)) throw new Error("The authentication sessions are invalid")

    return value
}

function isStoredSession(value: unknown): value is StoredSessionInput {

    if (!value || typeof value !== "object") return false

    const record = value as Partial<StoredSessionInput>

    return typeof record.identity === "string"
        && (record.owner === undefined || typeof record.owner === "boolean")
        && (record.disconnectedAt === null || typeof record.disconnectedAt === "number" && Number.isFinite(record.disconnectedAt))
}

interface StoredSession {

    identity: string

    owner: boolean

    disconnectedAt: number | null
}

type StoredSessionInput = Omit<StoredSession, "owner"> & { owner?: boolean }
