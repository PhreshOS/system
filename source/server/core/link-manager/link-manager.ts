import { Forward, Subscribe } from "@the-link/core/decorators"
import AuthManager from "./auth-manager/auth-manager"
import { Property, TheLink } from "@the-link/core"
import Application from "../application"
import type { Appearance, ConnectionSnapshot, SessionEndReason, SessionSnapshot } from "@phreshos/core"
import { type AuthenticationState, type SignUpError } from "../authentication/authentication"
import { AsyncLocalStorage } from "node:async_hooks"

/** Owns live Link boundaries and their browser Connection and Session relationships. */
export default class LinkManager extends TheLink {

    public readonly application: Application

    /** Every live transport boundary, including the external owner Gateway. */
    public readonly boundaries = new Map<string, LinkBoundary>()

    private readonly connectionContext = new AsyncLocalStorage<LinkBoundary>()

    public readonly authManager: AuthManager

    /** Public, unresolved representation of authoritative System Appearance. */
    public readonly appearance: Property<Appearance>

    private updatingAppearance: Promise<void> = Promise.resolve()

    public constructor(application: Application) {

        super()

        this.application = application

        this.appearance = Property.private(this, this.application.appearanceManager.value)

        this.authManager = new AuthManager(this)

        this.application.authentication.onSessionExpire(identity => {

            this.announceSessionEnd(identity, "expired").catch(() => undefined)
        })
    }

    /** Creates an unclassified browser boundary. */
    public addConnection(link: TheLink) {

        return this.addBoundary(link, false)
    }

    /** Creates a trusted transport boundary excluded from the Connection domain. */
    public addExternalConnection(link: TheLink) {

        return this.addBoundary(link, true)
    }

    private addBoundary(link: TheLink, external: boolean) {

        const connection = new LinkBoundary(this, link, external)

        this.boundaries.set(connection.identity, connection)

        return connection
    }

    /** Creates an unpublished browser Session and binds it to one live Connection. */
    private async addSession(connection: LinkBoundary) {

        this.requireConnection(connection)

        if (connection.session) throw new Error("The Connection already has a Session")

        if (connection.external) throw new Error("External boundaries do not own browser Sessions")

        const created = await this.application.authentication.createSession()

        try {

            await this.attach(connection, created.identity, false)
        }

        catch (error) {

            await this.application.authentication.removeSession(created.identity)

            throw error
        }

        return {

            identity: created.identity,

            token: created.token,

            linkManager: this,

            authManager: this.authManager
        }
    }

    /** Removes a boundary after its Client or transport has disconnected. */
    public removeConnection(connection: LinkBoundary) {

        return connection.transition(() => this.removeConnectionNow(connection))
    }

    private async removeConnectionNow(connection: LinkBoundary) {

        if (this.boundaries.get(connection.identity) !== connection) return

        const exposed = connection.exposed && !connection.external

        await this.detach(connection)

        connection.close()

        this.authManager.processManager.releaseConnection(connection.identity)

        this.boundaries.delete(connection.identity)

        if (!exposed) return

        const snapshot = this.connectionSnapshot(connection)

        await Promise.all([

            this.authManager.processManager.announceSubject("connection", "disconnect", connection.identity),

            this.authManager.processManager.announceHost("connection", "disconnect", connection.identity, snapshot),

            this.authManager.$outbound.publish("/connection/disconnect", snapshot)
        ])
    }

    public receive(connection: LinkBoundary, event: string, ...values: unknown[]) {

        this.requireConnection(connection)

        return this.connectionContext.run(connection, () => this.$inbound.publish(event, ...values))
    }

    public connection() {

        const connection = this.connectionContext.getStore()

        if (!connection) throw new Error("This operation requires a live Connection")

        this.requireConnection(connection)

        return connection
    }

    /** Every currently exposed browser Connection. */
    public connections() {

        return [...this.boundaries.values()].filter(connection => connection.exposed && !connection.external)
    }

    public findConnection(identity: string) {

        const connection = this.boundaries.get(identity)

        return connection?.exposed && !connection.external ? connection : null
    }

    public sessionOf(connection: LinkBoundary) {

        this.requirePublicConnection(connection)

        return connection.session && this.application.authentication.sessionFind(connection.session)
    }

    public sessionConnections(identity: string) {

        this.requireSession(identity)

        return this.connections().filter(connection => connection.session === identity)
    }

    /** Creates, attaches, and delivers a Client-owned token to one Connection. */
    public signInConnection(connection: LinkBoundary) {

        return connection.transition(() => this.signInConnectionNow(connection))
    }

    private async signInConnectionNow(connection: LinkBoundary) {

        this.requirePublicConnection(connection)

        const result = await this.addSession(connection)

        try {

            await connection.link.$outbound.publish("/session/signed-in", result.token)
        }

        catch (error) {

            connection.session = null

            await this.application.authentication.removeSession(result.identity)

            throw error
        }

        if (!await this.application.authentication.exposeSession(result.identity)) {

            connection.session = null

            await this.application.authentication.removeSession(result.identity)

            throw new Error("The Session could not enter the System registry")
        }

        await this.announceSessionCreate(result.identity)
        await this.announceConnectionSession(connection, this.sessionSnapshot(result.identity))
        await this.announceSessionConnection(result.identity, connection, true)

        return this.sessionSnapshot(result.identity)
    }

    /** Explicitly ends one browser Session without closing any Connections. */
    public async signOutSession(identity: string) {

        this.requireSession(identity)

        const connections = this.sessionConnections(identity)

        for (const connection of connections) connection.session = null

        await this.application.authentication.removeSession(identity)

        await Promise.allSettled(connections.map(connection => connection.link.$outbound.publish("/session/signed-out")))

        for (const connection of connections) {

            await this.announceConnectionSession(connection, null)

            await this.announceSessionConnection(identity, connection, false)
        }

        await this.announceSessionEnd(identity, "signedOut", connections)
    }

    @Subscribe("/owner/state")
    protected authenticationState(): AuthenticationState {

        return this.application.authentication.state()
    }

    @Subscribe("/owner/sign-up")
    protected async signUp(username: string, password: string): Promise<SignUpResponse> {

        const result = await this.application.authentication.signUp(username, password)

        if ("error" in result) return result

        await this.signInConnection(this.connection())

        return { signedUp: true }
    }

    @Subscribe("/owner/sign-in")
    protected async signIn(username: string, password: string) {

        if (!await this.application.authentication.verify(username, password)) return false

        await this.signInConnection(this.connection())

        return true
    }

    /** Resolves a Client-owned raw token to one valid Session identity. */
    public resolveSessionToken(token: string) {

        return this.application.authentication.resolveSession(token) ?? false
    }

    @Subscribe("/session-authenticate")
    protected sessionAuthenticate(token: string | null) {

        const connection = this.connection()

        return connection.transition(() => this.authenticateConnection(connection, token))
    }

    private async authenticateConnection(connection: LinkBoundary, token: string | null) {

        if (connection.external) throw new Error("External boundaries do not enter the browser Connection domain")

        const session = token ? this.resolveSessionToken(token) : false

        let attached = false

        if (connection.session !== (session || null)) {

            await this.detach(connection)

            if (session) {

                await this.attach(connection, session, false)
                attached = true
            }
        }

        await this.expose(connection)

        if (session && attached) await this.announceSessionConnection(session, connection, true)

        return session ? [token, this.authManager] : false
    }

    @Forward("outbound")
    protected async broadcastToBoundaries(event: string, ...values: unknown[]) {

        for (const { link } of this.boundaries.values()) await link.$outbound.publish(event, ...values)
    }

    /** Persist and publish one authorized Appearance replacement in call order. */
    public updateAppearance(value: unknown) {

        const update = this.updatingAppearance.then(async () => {

            const previous = this.application.appearanceManager.value
            const appearance = await this.application.appearanceManager.update(value)

            if (appearance !== previous) await this.appearance.update(appearance)

            return appearance
        })

        this.updatingAppearance = update.then(() => undefined, () => undefined)

        return update
    }

    public connectionSnapshot(connection: LinkBoundary): ConnectionSnapshot {

        return Object.freeze({

            identity: connection.identity,

            connected: this.boundaries.get(connection.identity) === connection && !connection.signal.aborted,

            session: connection.session && this.application.authentication.sessionFind(connection.session)
        })
    }

    public sessionSnapshot(identity: string, valid = this.application.authentication.sessionFind(identity) !== null): SessionSnapshot {

        return Object.freeze({ identity, valid })
    }

    private async expose(connection: LinkBoundary) {

        if (connection.exposed) return

        connection.exposed = true

        const snapshot = this.connectionSnapshot(connection)

        await Promise.all([

            this.authManager.processManager.announceHost("connection", "create", connection.identity, snapshot),

            this.authManager.$outbound.publish("/connection/create", snapshot)
        ])
    }

    private async attach(connection: LinkBoundary, session: string, announce = true) {

        if (connection.session === session) return

        if (connection.session) await this.detach(connection)

        if (!await this.application.authentication.connectSession(session)) throw new Error("The Session is unavailable")

        connection.session = session

        if (connection.external) return

        if (announce) {

            await this.announceConnectionSession(connection, this.sessionSnapshot(session))
            await this.announceSessionConnection(session, connection, true)
        }
    }

    private async detach(connection: LinkBoundary) {

        const session = connection.session

        if (!session) return

        connection.session = null

        await this.application.authentication.disconnectSession(session)

        if (connection.external) return

        await this.announceConnectionSession(connection, null)
        await this.announceSessionConnection(session, connection, false)
    }

    private async announceConnectionSession(connection: LinkBoundary, session: SessionSnapshot | null) {

        await Promise.all([

            this.authManager.processManager.announceSubject("connection", "sessionChange", connection.identity, session),

            this.authManager.$outbound.publish("/connection/session-change", this.connectionSnapshot(connection), session)
        ])
    }

    private async announceSessionCreate(identity: string) {

        const session = this.sessionSnapshot(identity)

        await Promise.all([

            this.authManager.processManager.announceHost("session", "create", identity, session),

            this.authManager.$outbound.publish("/session/create", session)
        ])
    }

    private async announceSessionConnection(identity: string, connection: LinkBoundary, attached: boolean) {

        const session = this.sessionSnapshot(identity, attached || this.application.authentication.sessionValid(identity))

        const snapshot = this.connectionSnapshot(connection)

        const event = attached ? "connectionAttach" : "connectionDetach"

        const route = attached ? "/session/connection-attach" : "/session/connection-detach"

        await Promise.all([

            this.authManager.processManager.announceSubject("session", event, identity, snapshot),

            this.authManager.$outbound.publish(route, session, snapshot)
        ])
    }

    private async announceSessionEnd(identity: string, reason: SessionEndReason, previousConnections: readonly LinkBoundary[] = []) {

        const session = this.sessionSnapshot(identity, false)

        await Promise.all([

            this.authManager.processManager.announceSubject("session", "end", identity, reason),

            this.authManager.processManager.announceHost("session", "end", identity, session, reason),

            this.authManager.$outbound.publish(
                "/session/end",
                session,
                reason,
                previousConnections.map(connection => this.connectionSnapshot(connection))
            )
        ])
    }

    private requireConnection(connection: LinkBoundary) {

        if (this.boundaries.get(connection.identity) !== connection || connection.signal.aborted) throw new Error("Connection not found")
    }

    private requirePublicConnection(connection: LinkBoundary) {

        this.requireConnection(connection)

        if (connection.external || !connection.exposed) throw new Error("Connection not found")
    }

    private requireSession(identity: string) {

        if (!this.application.authentication.sessionFind(identity)) throw new Error("Session not found")
    }

    // The transport stays internal. Only public state is represented.
    public toJSON() {

        return { appearance: this.appearance }
    }
}

export interface LinkManagerSnapshot {

    appearance: ReturnType<Property<Appearance>["toJSON"]>
}

export type SignUpResponse = { signedUp: true } | { error: SignUpError }

/** One internal Link boundary. Only browser boundaries enter the public Connection registry. */
export class LinkBoundary {

    public readonly identity = crypto.randomUUID()

    public session: string | null = null

    public exposed = false

    private readonly lifetime = new AbortController()

    private transitioning: Promise<void> = Promise.resolve()

    public readonly signal = this.lifetime.signal

    public constructor(

        private readonly manager: LinkManager,

        public readonly link: TheLink,

        public readonly external: boolean

    ) {}

    public publish(event: string, ...values: unknown[]) {

        return this.manager.receive(this, event, ...values)
    }

    /** Serializes Session and lifecycle mutations belonging to this Connection. */
    public transition<Value>(work: () => Promise<Value>): Promise<Value> {

        const result = this.transitioning.then(work, work)

        this.transitioning = result.then(() => undefined, () => undefined)

        return result
    }

    public close() {

        this.lifetime.abort(new Error("The System representation disconnected"))
    }
}
