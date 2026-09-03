import { Forward, Subscribe } from "@the-link/core/decorators"
import AuthManager from "./auth-manager/auth-manager"
import { TheLink } from "@the-link/core"
import { Property } from "@the-link/core"
import { Transmitted } from "@libs/messagepack"
import Application from "../application"
import { type Appearance } from "@phreshos/core"
import { type AuthenticationState, type RegistrationError } from "../authentication/authentication"
import { AsyncLocalStorage } from "node:async_hooks"

export default class LinkManager extends TheLink {

    public readonly application: Application

    /** Live desktop connections. Authentication sessions outlive these links. */
    public readonly connections = new Map<string, Connection>()

    private readonly connectionContext = new AsyncLocalStorage<Connection>()

    public readonly authManager: AuthManager

    /** Public, unresolved representation of authoritative System Appearance. */
    public readonly appearance: Property<Appearance>

    private updatingAppearance: Promise<void> = Promise.resolve()

    public constructor(application: Application) {

        super()

        this.application = application

        this.appearance = Property.private(this, this.application.appearanceManager.value)

        this.authManager = new AuthManager(this)
    }

    public addConnection(link: TheLink) {

        const connection = new Connection(this, link)

        this.connections.set(connection.identity, connection)

        return connection
    }

    public async removeConnection(connection: Connection) {

        if (this.connections.get(connection.identity) !== connection) return

        this.authManager.processManager.releaseConnection(connection.identity)

        this.connections.delete(connection.identity)

        if (connection.session && !this.connected(connection.session)) await this.application.authentication.disconnectSession(connection.session)
    }

    public receive(connection: Connection, event: string, ...values: unknown[]) {

        if (this.connections.get(connection.identity) !== connection) throw new Error("Connection not found")

        return this.connectionContext.run(connection, () => this.$inbound.publish(event, ...values))
    }

    public connection() {

        const connection = this.connectionContext.getStore()

        if (!connection || this.connections.get(connection.identity) !== connection) throw new Error("This operation requires a live connection")

        return connection
    }

    @Subscribe("/owner/state")
    protected authenticationState(): AuthenticationState {

        return this.application.authentication.state()
    }

    @Subscribe("/owner/register")
    protected async register(username: string, password: string): Promise<RegistrationResponse> {

        const result = await this.application.authentication.register(username, password)

        if ("error" in result) return result

        return { authorization: await this.createAuthorization() }
    }

    @Subscribe("/owner/sign-in")
    protected async signIn(username: string, password: string) {

        if (!await this.application.authentication.verify(username, password)) return false

        return await this.createAuthorization()
    }

    private async createAuthorization() {

        const session = await this.application.authentication.createSession()

        return this.application.encryptor.createToken({ version: 1, session })
    }

    public resolveAuthorization(authorization: string) {

        // Anything that is not a token at all makes the verifier throw
        // about buffers. What that means is "not authorized", and that
        // is what a caller should be told.
        try {

            const result = this.application.encryptor.verifyToken<unknown>(authorization)

            if (!result || !isAuthorization(result.payload)) return false

            return this.application.authentication.sessionValid(result.payload.session) ? result.payload.session : false
        }

        catch {

            return false
        }
    }

    @Subscribe("/session-authenticate")
    protected async sessionAuthenticate(authorization: string | null) {

        const connection = this.connection()

        if (!authorization) {

            await this.releaseAuthorization(connection, true)

            return false
        }

        const session = this.resolveAuthorization(authorization)

        if (!session) {

            await this.releaseAuthorization(connection)

            return false
        }

        if (connection.session !== session) await this.releaseAuthorization(connection)

        if (!await this.application.authentication.connectSession(session)) return false

        connection.session = session

        return [authorization, this.authManager]
    }

    @Forward("outbound")
    protected async broadcastToConnections(event: string, ...values: unknown[]) {

        for (const { link } of this.connections.values()) {

            await link.$outbound.publish(event, ...values)
        }
    }

    private connected(session: string) {

        return [...this.connections.values()].some(connection => connection.session === session)
    }

    private async releaseAuthorization(connection: Connection, remove = false) {

        const session = connection.session

        connection.session = null

        if (!session) return

        if (remove) {

            for (const current of this.connections.values()) {

                if (current.session === session) current.session = null
            }

            await this.application.authentication.removeSession(session)

            return
        }

        if (!this.connected(session)) await this.application.authentication.disconnectSession(session)
    }

    /** Persist and publish one authorized Appearance replacement in call order. */
    public updateAppearance(value: unknown) {

        const update = this.updatingAppearance.then(async () => {

            const appearance = await this.application.appearanceManager.update(value)

            await this.appearance.update(appearance)

            return appearance
        })

        this.updatingAppearance = update.then(() => undefined, () => undefined)

        return update
    }

    // Nothing about the link itself crosses. The declaration stays, so
    // what a session is born with is stated rather than inferred from
    // whatever the object happens to hold.
    public toJSON() {

        return {

            appearance: this.appearance
        }
    }
}

export type TransmittedLinkManager = Transmitted<LinkManager>

export type RegistrationResponse = { authorization: string } | { error: RegistrationError }

export class Connection {

    public readonly identity = crypto.randomUUID()

    public session: string | null = null

    public constructor(private readonly manager: LinkManager, public readonly link: TheLink) {}

    public publish(event: string, ...values: unknown[]) {

        return this.manager.receive(this, event, ...values)
    }
}

function isAuthorization(value: unknown): value is { version: 1, session: string } {

    if (!value || typeof value !== "object") return false

    const authorization = value as { version?: unknown, session?: unknown }

    return authorization.version === 1 && typeof authorization.session === "string"
}
