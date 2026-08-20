import { Forward, Subscribe } from "@libs/the-link/decorators/escript"
import AuthManager from "./auth-manager/auth-manager"
import TheLink from "@libs/the-link/the-link"
import Property from "@libs/the-link/property"
import { Transmitted } from "@libs/messagepack"
import Application from "../application"
import { type ThemeProperties, type WallpaperLaunch } from "@phreshos/core"
import { type default as Program } from "./auth-manager/program-manager/program"
import { type AuthenticationState, type RegistrationError } from "../authentication/authentication"

export default class LinkManager extends TheLink {

    public readonly application: Application

    /** Live desktop connections. Authentication sessions outlive these links. */
    public readonly connections = new Map<string, Connection>()

    public readonly authManager: AuthManager

    /** Public, read-only representation of the authoritative system Theme. */
    public readonly theme: Property<ThemeProperties>

    /** Public sign-in wallpaper filename, or `null` for the bundled asset. */
    public readonly signInWallpaper: Property<string | null>

    /** Public desktop file wallpaper, or `null` when bundled or Program-backed. */
    public readonly desktopWallpaper: Property<string | null>

    private updatingTheme: Promise<void> = Promise.resolve()

    public constructor(application: Application) {

        super()

        this.application = application

        this.theme = Property.private(this, this.application.themeManager.value)

        this.signInWallpaper = Property.private(this, this.application.wallpaperManager.signIn)

        this.desktopWallpaper = Property.private(this, this.application.wallpaperManager.desktopFile)

        this.authManager = new AuthManager(this)
    }

    public addConnection(link: TheLink) {

        const identity = crypto.randomUUID()

        this.connections.set(identity, { link, session: null })

        return identity
    }

    public async removeConnection(identity: string) {

        const connection = this.connections.get(identity)

        this.authManager.processManager.releaseConnection(identity)

        this.connections.delete(identity)

        if (connection?.session && !this.connected(connection.session)) await this.application.authentication.disconnectSession(connection.session)
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
    protected async sessionAuthenticate(connectionIdentity: string, authorization: string | null) {

        const connection = this.connections.get(connectionIdentity)

        if (!connection) throw new Error("Connection not found")

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

    /** Persist and publish one authorized Theme replacement in call order. */
    public updateTheme(value: unknown) {

        const update = this.updatingTheme.then(async () => {

            const theme = await this.application.themeManager.update(value)

            await this.theme.update(theme)

            return theme
        })

        this.updatingTheme = update.then(() => undefined, () => undefined)

        return update
    }

    public async setSignInWallpaper(file: unknown) {

        const selected = await this.application.wallpaperManager.setSignIn(file)

        await this.signInWallpaper.update(selected)
    }

    public async removeSignInWallpaper() {

        await this.application.wallpaperManager.removeSignIn()

        await this.signInWallpaper.update(null)
    }

    public async setDesktopWallpaper(file: unknown) {

        const selected = await this.application.wallpaperManager.setDesktopFile(file, this.authManager.programManager)

        await this.desktopWallpaper.update(selected)
    }

    public async setDesktopWallpaperProgram(program: Program, launch: WallpaperLaunch) {

        await this.application.wallpaperManager.setDesktopProgram(program, launch, this.authManager.programManager)

        await this.desktopWallpaper.update(null)
    }

    public async removeDesktopWallpaper() {

        await this.application.wallpaperManager.removeDesktop(this.authManager.programManager)

        await this.desktopWallpaper.update(null)
    }

    // Nothing about the link itself crosses. The declaration stays, so
    // what a session is born with is stated rather than inferred from
    // whatever the object happens to hold.
    public toJSON() {

        return {

            theme: this.theme,

            signInWallpaper: this.signInWallpaper,

            desktopWallpaper: this.desktopWallpaper
        }
    }
}

export type TransmittedLinkManager = Transmitted<LinkManager>

export type RegistrationResponse = { authorization: string } | { error: RegistrationError }

interface Connection {

    link: TheLink

    session: string | null
}

function isAuthorization(value: unknown): value is { version: 1, session: string } {

    if (!value || typeof value !== "object") return false

    const authorization = value as { version?: unknown, session?: unknown }

    return authorization.version === 1 && typeof authorization.session === "string"
}
