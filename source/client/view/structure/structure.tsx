import ReactTunnel from "@libs/the-link/plugins/react-helper/react-tunnel"
import useProperty from "@libs/the-link/plugins/react-helper/property-hook"
import { TransmittedLinkManager } from "@server/core/link-manager/link-manager"
import SocketLink from "@libs/the-link/plugins/client-link/socket-link"
import LinkManager from "@client/core/link-manager/link-manager"
import { AppearanceProvider, useResolveTheme } from "@phreshos/react-ui"
import { useTheme } from "next-themes"
import Loading from "../components/loading"
import Alert from "../components/alert"
import { ApplicationContext, LinkManagerContext } from "../contexts"
import usePromise from "@libs/react-promise"
import Authentication from "./authentication/authentication"
import { useCallback, useEffect, useState } from "react"
import Readiness, { useReady } from "@libs/readiness/main"
import { standardAppearance, type ThemePreference } from "@phreshos/core"

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

    const [linkManager, setLinkManager] = useState<LinkManager | null>(null)

    const [connectionRevision, setConnectionRevision] = useState(0)

    const internal = ReactTunnel.useFactory(application.clientLink.$internal)

    internal.useSubscribe("subscribe", useCallback(function (socketLink: SocketLink<[TransmittedLinkManager, string]>) {

        const [payload, connectionIdentity] = socketLink.payload

        const manager = new LinkManager(application, socketLink, payload, connectionIdentity)

        socketLink.$internal.subscribeOnce("unsubscribe", () => {

            manager.dispose()

            setLinkManager(current => current === manager ? null : current)
        })

        setLinkManager(manager)
    }, [application]))

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

    const { resolvedTheme, setTheme } = useTheme()

    const inbound = ReactTunnel.useFactory(linkManager.$inbound)

    inbound.useSubscribe("/change-theme", useCallback(function (theme: ThemePreference) {
        setTheme(theme === "default" ? "system" : theme)
    }, [setTheme]))

    const appearance = useProperty(linkManager.appearance)

    const theme = resolvedTheme === "dark" ? "dark" : "light"

    useEffect(function () {
        void linkManager.theme.update(theme)
    }, [linkManager, theme])

    return <LinkManagerContext.Provider value={linkManager}>

        <AppearanceProvider appearance={appearance} theme={theme}>

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
