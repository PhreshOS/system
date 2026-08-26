import ReactTunnel from "@libs/the-link/plugins/react-helper/react-tunnel"
import { type TransmittedLinkManager } from "@server/core/link-manager/link-manager"
import SocketLink from "@libs/the-link/plugins/client-link/socket-link"
import LinkManager from "@client/core/link-manager/link-manager"
import { Button, Spinner, Switch, SwitchGroup } from "@heroui/react"
import { ApplicationContext, LinkManagerContext } from "../contexts"
import Authentication from "./authentication/authentication"
import usePromise from "@libs/react-promise"
import useStorage from "@libs/storage-hook"
import { useTheme } from "next-themes"
import { useCallback, useLayoutEffect, useState } from "react"

export default function () {

    const { resolvedTheme, setTheme } = useTheme()

    const direction = useStorage("direction")

    const reversed = direction.value === "rtl"

    useLayoutEffect(function () {

        document.documentElement.dir = reversed ? "rtl" : "ltr"

    }, [reversed])

    return <main className="grid min-h-dvh grid-rows-[auto_minmax(0,1fr)] bg-background font-roboto text-foreground">

        <SwitchGroup orientation="horizontal" className="justify-self-end p-4">

            <Switch isSelected={resolvedTheme === "dark"} onChange={dark => setTheme(dark ? "dark" : "light")}>

                <Switch.Content>

                    <Switch.Control><Switch.Thumb /></Switch.Control>

                    Dark theme

                </Switch.Content>

            </Switch>

            <Switch isSelected={reversed} onChange={value => direction.update(value ? "rtl" : "ltr")}>

                <Switch.Content>

                    <Switch.Control><Switch.Thumb /></Switch.Control>

                    Reverse reading direction

                </Switch.Content>

            </Switch>

        </SwitchGroup>

        <Connection />

    </main>
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

    if (connection.exception) return <ConnectionFailure error={connection.exception.current} retry={connection.safeExecute} />

    if (!linkManager) return <Spinner aria-label="Connecting to PhreshOS" className="place-self-center" />

    return <LinkManagerContext.Provider value={linkManager}>

        <Authentication />

    </LinkManagerContext.Provider>
}

function ConnectionFailure({ error, retry }: { error: unknown, retry: () => Promise<void | undefined> }) {

    return <section className="grid place-self-center justify-items-center gap-4 p-6 text-center">

        <h1 className="text-xl font-semibold">PhreshOS is unavailable</h1>

        <p className="text-muted">{error instanceof Error ? error.message : String(error)}</p>

        <Button onPress={() => void retry()}>Try again</Button>

    </section>
}
