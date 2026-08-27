import ReactTunnel from "@libs/the-link/plugins/react-helper/react-tunnel"
import useProperty from "@libs/the-link/plugins/react-helper/property-hook"
import { TransmittedLinkManager } from "@server/core/link-manager/link-manager"
import SocketLink from "@libs/the-link/plugins/client-link/socket-link"
import LinkManager from "@client/core/link-manager/link-manager"
import { ThemeProvider } from "@phreshos/react-ui"
import Loading from "../components/loading"
import Alert from "../components/alert"
import { ApplicationContext, LinkManagerContext } from "../contexts"
import usePromise from "@libs/react-promise"
import Authentication from "./authentication/authentication"
import { useCallback, useState } from "react"
import Readiness, { useReady } from "@libs/readiness/main"
import { standardTheme } from "@phreshos/core"

const startupRequirements = ["connection", "session", "wallpaper"] as const

export default function () {

    return <Readiness requirements={startupRequirements}>

        <Desktop />

        <Readiness.Pending>

            {pending => <Loading

                aria-hidden={pending.length === 0}

                className={`transition-opacity duration-200 ease-out ${pending.length ? "" : "pointer-events-none opacity-0"}`}

                style={{ backgroundColor: standardTheme.background }}

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

        socketLink.$internal.subscribeOnce("unsubscribe", () => setLinkManager(null))

        const [payload, connectionIdentity] = socketLink.payload

        setLinkManager(new LinkManager(application, socketLink, payload, connectionIdentity))
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

    const theme = useProperty(linkManager.theme)

    return <LinkManagerContext.Provider value={linkManager}>

        <ThemeProvider theme={theme}>

            <div className="grid min-h-0" style={{ backgroundColor: theme.background }}>

                <Authentication />

            </div>

        </ThemeProvider>

    </LinkManagerContext.Provider>
}
