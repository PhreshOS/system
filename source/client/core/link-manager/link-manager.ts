import { AuthManagerSnapshot } from "@server/core/link-manager/auth-manager/auth-manager"
import { LinkManagerSnapshot } from "@server/core/link-manager/link-manager"
import { type AuthenticationState } from "@server/core/authentication/authentication"
import { type RegistrationResponse } from "@server/core/link-manager/link-manager"
import { type Appearance, type DesktopPreferences, type DesktopPreferencesUpdate } from "@phreshos/core"
import { Forward } from "@the-link/core/decorators"
import { TheLink } from "@the-link/core"
import { Property } from "@the-link/core"
import Application from "../application"
import { v4 as uuidv4 } from "uuid"
import { type RequestOutcome, unwrap } from "@libs/request-outcome"

export default class LinkManager extends TheLink {

    public readonly application: Application

    public readonly sourceLink: TheLink

    /** Immediate unresolved System Appearance and future authoritative updates. */
    public readonly appearance: Property<Appearance>

    /** Complete effective local Desktop preferences and future updates. */
    public readonly desktopPreferences: Property<DesktopPreferences>

    public constructor(application: Application, sourceLink: TheLink, payload: LinkManagerSnapshot, desktopPreferences: DesktopPreferences) {

        super()

        this.application = application

        this.sourceLink = sourceLink

        this.subscribeTo(this.sourceLink)

        this.appearance = Property.consumer(this, payload.appearance.key, payload.appearance.value)

        this.desktopPreferences = Property.private(this, desktopPreferences)
    }

    public requestDesktopPreferences(preferences: DesktopPreferencesUpdate) {
        return this.$inbound.publish("/change-desktop-preferences", preferences)
    }

    public updateDesktopPreferences(preferences: DesktopPreferences) {
        return this.desktopPreferences.update(preferences)
    }

    @Forward("outbound")
    public async forwardToSession(event: string, ...values: unknown[]) {

        const responseUuid = uuidv4()

        await this.sourceLink.$outbound.publish(event, responseUuid, ...values)

        const response = await this.sourceLink.$inbound.waitFirst<RequestOutcome<unknown[]>>(responseUuid)

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

        return await this.$outbound.publishFirst<[string, AuthManagerSnapshot] | false>("/session-authenticate", authorization)
    }
}
