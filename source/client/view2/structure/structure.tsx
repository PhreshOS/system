import ReactTunnel from "@libs/the-link/plugins/react-helper/react-tunnel"
import { type TransmittedLinkManager } from "@server/core/link-manager/link-manager"
import SocketLink from "@libs/the-link/plugins/client-link/socket-link"
import LinkManager from "@client/core/link-manager/link-manager"
import { Spinner, SwitchGroup } from "@heroui/react"
import { ApplicationContext, LinkManagerContext } from "../contexts"
import Authentication from "./authentication/authentication"
import DirectionSwitch from "../components/direction-switch"
import ThemeSwitch from "../components/theme-switch"
import Failure from "../components/failure"
import usePromise from "@libs/react-promise"
import { useCallback, useState } from "react"

export default function () {

    return <>

        <SwitchGroup orientation="horizontal" className="justify-self-end p-4">

            <ThemeSwitch />

            <DirectionSwitch />

        </SwitchGroup>

        <Connection />

    </>
}

function Connection() {

    const application = ApplicationContext.useValue()

    const [linkManager, setLinkManager] = useState<LinkManager | null>(null)

    const internal = ReactTunnel.useFactory(application.clientLink.$internal)

    internal.useSubscribe("subscribe", useCallback(function (socketLink: SocketLink<[TransmittedLinkManager, string]>) {

        const [payload, connectionIdentity] = socketLink.payload

        const connected = new LinkManager(application, socketLink, payload, connectionIdentity)

        socketLink.$internal.subscribeOnce("unsubscribe", () => setLinkManager(current => current === connected ? null : current))

        setLinkManager(connected)

    }, [application]))

    const connection = usePromise(async function () {

        application.clientLink.subscribe()

    }, [])

    if (connection.exception) return <Failure title="PhreshOS is unavailable" error={connection.exception.current} retry={connection.safeExecute} />

    if (!linkManager) return <Spinner aria-label="Connecting to PhreshOS" className="place-self-center" />

    return <LinkManagerContext.Provider value={linkManager}>

        <Authentication />

    </LinkManagerContext.Provider>
}
