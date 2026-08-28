import { TransmittedAuthManager } from "@server/core/link-manager/auth-manager/auth-manager"
import { TransmittedLinkManager } from "@server/core/link-manager/link-manager"
import { type AuthenticationState } from "@server/core/authentication/authentication"
import { type RegistrationResponse } from "@server/core/link-manager/link-manager"
import { type Appearance, type Theme, type ThemePreference } from "@phreshos/core"
import { Forward } from "@libs/the-link/decorators/escript"
import TheLink from "@libs/the-link/the-link"
import Property from "@libs/the-link/property"
import Application from "../application"
import { v4 as uuidv4 } from "uuid"
import { type Outcome, unwrap } from "@server/core/outcome"

export default class LinkManager extends TheLink {

    public readonly application: Application

    public readonly sourceLink: TheLink

    public readonly connectionIdentity: string

    /** Immediate unresolved System Appearance and future authoritative updates. */
    public readonly appearance: Property<Appearance>

    /** Effective local Desktop Theme and its future updates. */
    public readonly theme: Property<Theme>

    private themePreference: ThemePreference = "default"
    private readonly nativeTheme = matchMedia("(prefers-color-scheme: dark)")

    public constructor(application: Application, sourceLink: TheLink, payload: TransmittedLinkManager, connectionIdentity: string) {

        super()

        this.application = application

        this.sourceLink = sourceLink

        this.connectionIdentity = connectionIdentity

        this.subscribeTo(this.sourceLink)

        this.appearance = Property.consumer(this, payload.appearance.key, payload.appearance.value)

        this.theme = Property.private(this, this.effectiveTheme())

        this.nativeTheme.addEventListener("change", this.nativeThemeChanged)
    }

    public async updateTheme(theme: ThemePreference) {
        this.themePreference = theme
        await this.$inbound.publish("/change-theme", theme)
    }

    private effectiveTheme(): Theme {
        return this.themePreference === "default"
            ? this.nativeTheme.matches ? "dark" : "light"
            : this.themePreference
    }

    private readonly nativeThemeChanged = () => {
        if (this.themePreference === "default") void this.theme.update(this.effectiveTheme())
    }

    public dispose() {
        this.nativeTheme.removeEventListener("change", this.nativeThemeChanged)
    }

    @Forward("outbound")
    public async forwardToSession(event: string, ...values: unknown[]) {

        const responseUuid = uuidv4()

        await this.sourceLink.$outbound.publish(event, responseUuid, ...values)

        const response = await this.sourceLink.$inbound.waitFirst<Outcome<unknown[]>>(responseUuid)

        return unwrap(response)
    }

    // A transport emission with no response address. Used for private facts
    // whose producer must never wait for, retry, or observe host handling.
    public emitToSession(event: string, ...values: unknown[]) {

        this.sourceLink.$outbound.publish(event, null, ...values).catch(() => undefined)
    }

    public async authenticationState() {

        return await this.$outbound.publishFirst<AuthenticationState>("/owner/state")
    }

    public async register(username: string, password: string) {

        return await this.$outbound.publishFirst<RegistrationResponse>("/owner/register", username, password)
    }

    public async signIn(username: string, password: string) {

        return await this.$outbound.publishFirst<string | false>("/owner/sign-in", username, password)
    }

    public async sessionAuthenticate(authorization: string | null) {

        return await this.$outbound.publishFirst<[string, TransmittedAuthManager] | false>("/session-authenticate", this.connectionIdentity, authorization)
    }
}
