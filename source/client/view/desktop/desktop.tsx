import ReactTunnel from "@libs/the-link/plugins/react-helper/react-tunnel"
import useProperty from "@libs/the-link/plugins/react-helper/property-hook"
import { TransmittedLinkManager } from "@server/core/link-manager/link-manager"
import SocketLink from "@libs/the-link/plugins/client-link/socket-link"
import LinkManager from "@client/core/link-manager/link-manager"
import { ThemeProvider } from "@phreshos/react-ui"
import Loading from "../components/loading"
import { ApplicationContext, LinkManagerContext } from "../contexts"
import usePromise from "@libs/react-promise"
import Session from "./session/session"
import { useCallback, useState } from "react"
import Readiness, { useReadiness } from "@libs/readiness/main"
import { standardTheme } from "@phreshos/core"

const startupRequirements = ["connection", "session", "wallpaper"] as const

export default function () {

    return <Readiness requirements={startupRequirements}>

        <Desktop />

        <Readiness.Pending>

            <Loading style={{ backgroundColor: standardTheme.background, backdropFilter: "none" }} />

        </Readiness.Pending>

    </Readiness>
}

function Desktop() {

    const application = ApplicationContext.useValue()

    const [linkManager, setLinkManager] = useState<LinkManager | null>(null)

    const { ready } = useReadiness()

    const internal = ReactTunnel.useFactory(application.clientLink.$internal)

    internal.useSubscribe("subscribe", useCallback(function (socketLink: SocketLink<[TransmittedLinkManager, string]>) {

        socketLink.$internal.subscribeOnce("unsubscribe", () => setLinkManager(null))

        const [payload, connectionIdentity] = socketLink.payload

        setLinkManager(new LinkManager(application, socketLink, payload, connectionIdentity))

        ready("connection")
    }, [application, ready]))

    usePromise(async () => application.clientLink.subscribe(), [])

    if (!linkManager) return null

    return <ConnectedDesktop linkManager={linkManager} />
}

function ConnectedDesktop({ linkManager }: { linkManager: LinkManager }) {

    const theme = useProperty(linkManager.theme)

    return <LinkManagerContext.Provider value={linkManager}>

        <ThemeProvider theme={theme}>

            <div className="grid min-h-0" style={{ backgroundColor: theme.background }}>

                <Session />

            </div>

        </ThemeProvider>

    </LinkManagerContext.Provider>
}
