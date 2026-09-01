import { ReactTunnel } from "@the-link/react"
import { useProperty } from "@the-link/react"
import { TransmittedLinkManager } from "@server/core/link-manager/link-manager"
import { SocketLink } from "@the-link/client"
import LinkManager from "@client/core/link-manager/link-manager"
import { AppearanceProvider, useResolveTheme } from "@phreshos/react-ui"
import Loading from "../components/loading"
import Alert from "../components/alert"
import { ApplicationContext, LinkManagerContext } from "../contexts"
import usePromise from "@libs/react-promise"
import { useDesktopPreferences } from "../appearance/desktop-preferences"
import Authentication from "./authentication/authentication"
import { useCallback, useEffect, useState } from "react"
import Readiness, { useReady } from "@libs/readiness"
import { standardAppearance, type DesktopPreferencesUpdate } from "@phreshos/core"

const startupRequirements = ["connection", "session", "wallpaper"] as const

export default function () {

    return <Readiness requirements={startupRequirements}>

        <Desktop />

        <Readiness.Pending>

            {pending => <Loading

                aria-hidden={pending.length === 0}

                className={`transition-opacity duration-200 ease-out ${pending.length ? "" : "pointer-events-none opacity-0"}`}

                style={{ backgroundColor: standardAppearance.background.light }}

            />}

        </Readiness.Pending>

    </Readiness>
}

function Desktop() {

    const application = ApplicationContext.useValue()
    const { preferences } = useDesktopPreferences()

    const [linkManager, setLinkManager] = useState<LinkManager | null>(null)

    const [connectionRevision, setConnectionRevision] = useState(0)

    const internal = ReactTunnel.useFactory(application.clientLink.$internal)

    internal.useSubscribe("subscribe", useCallback(function (socketLink: SocketLink<[TransmittedLinkManager, string]>) {

        const [payload, connectionIdentity] = socketLink.payload

        const manager = new LinkManager(application, socketLink, payload, connectionIdentity, preferences)

        socketLink.$internal.subscribeOnce("unsubscribe", () => {
            setLinkManager(current => current === manager ? null : current)
        })

        setLinkManager(manager)
    }, [application, preferences]))

    const connection = usePromise(async () => application.clientLink.subscribe(), [application, connectionRevision])

    if (connection.exception) return <FailedConnection

        exception={connection.exception.current}

        retry={() => setConnectionRevision(revision => revision + 1)}

    />

    if (!linkManager) return null

    return <ConnectedDesktop linkManager={linkManager} />
}

function FailedConnection({ exception, retry }: { exception: unknown, retry: () => void }) {

    useReady("connection")

    useReady("session")

    useReady("wallpaper")

    return <Alert className="m-auto grid w-fit gap-3">

        <span>{String(exception)}</span>

        <button type="button" className="cursor-pointer justify-self-end" onClick={retry}>Try again</button>

    </Alert>
}

function ConnectedDesktop({ linkManager }: { linkManager: LinkManager }) {

    useReady("connection")

    const { preferences, update } = useDesktopPreferences()

    const inbound = ReactTunnel.useFactory(linkManager.$inbound)

    inbound.useSubscribe("/change-desktop-preferences", useCallback(function (change: DesktopPreferencesUpdate) {
        update(change)
    }, [update]))

    const appearance = useProperty(linkManager.appearance)

    useEffect(function () {
        void linkManager.updateDesktopPreferences(preferences)
    }, [linkManager, preferences])

    return <LinkManagerContext.Provider value={linkManager}>

        <AppearanceProvider appearance={appearance} theme={preferences.theme}>

            <ConnectedAppearance>

                <Authentication />

            </ConnectedAppearance>

        </AppearanceProvider>

    </LinkManagerContext.Provider>
}

function ConnectedAppearance({ children }: { children: React.ReactNode }) {

    const background = useResolveTheme(LinkManagerContext.useValue().appearance.value.background)

    return <div className="grid min-h-0" style={{ backgroundColor: background }}>{children}</div>
}
