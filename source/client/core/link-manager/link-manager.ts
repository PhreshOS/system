import { TransmittedAuthManager } from "@server/core/link-manager/auth-manager/auth-manager"
import { TransmittedLinkManager } from "@server/core/link-manager/link-manager"
import { type AuthenticationState } from "@server/core/authentication/authentication"
import { type RegistrationResponse } from "@server/core/link-manager/link-manager"
import { type ThemeProperties } from "@phreshos/core"
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

    /** Immediate public Theme value and its future synchronized updates. */
    public readonly theme: Property<ThemeProperties>

    /** Immediate public sign-in wallpaper filename and future updates. */
    public readonly signInWallpaper: Property<string | null>

    /** Immediate public desktop file wallpaper and future updates. */
    public readonly desktopWallpaper: Property<string | null>

    public constructor(application: Application, sourceLink: TheLink, payload: TransmittedLinkManager, connectionIdentity: string) {

        super()

        this.application = application

        this.sourceLink = sourceLink

        this.connectionIdentity = connectionIdentity

        this.subscribeTo(this.sourceLink)

        this.theme = Property.consumer(this, payload.theme.key, payload.theme.value)

        this.signInWallpaper = Property.consumer(this, payload.signInWallpaper.key, payload.signInWallpaper.value)

        this.desktopWallpaper = Property.consumer(this, payload.desktopWallpaper.key, payload.desktopWallpaper.value)
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
