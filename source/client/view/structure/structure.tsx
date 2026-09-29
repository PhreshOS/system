import { ReactTunnel } from "@the-link/react"
import { useProperty } from "@the-link/react"
import { LinkManagerSnapshot } from "@server/core/link-manager/link-manager"
import LinkManager from "@client/core/link-manager/link-manager"
import { useAppearance } from "@phreshos/react-ui"
import Loading from "../components/loading"
import Alert from "../components/alert"
import { ApplicationContext, LinkManagerContext } from "../contexts"
import usePromise from "@libs/react-promise"
import { useDesktopPreferences } from "../appearance/desktop-preferences"
import { useRememberSystemAppearance } from "../appearance/appearance"
import Authentication from "./authentication/authentication"
import { useCallback, useEffect, useState } from "react"
import Readiness, { useReadiness, useReady } from "@libs/readiness"
import { type DesktopPreferencesUpdate } from "@phreshos/core"
import { cssEasing } from "../appearance/motion"
import {
    connectionRequirement,
    sessionRequirement,
    startupRequirements,
    type DesktopReadinessRequirement,
    wallpaperRequirement
} from "./readiness-requirements"

export default function () {
    const appearance = useAppearance()

    return <Readiness requirements={startupRequirements}>

        <Desktop />

        <DesktopReadiness appearance={appearance} />

    </Readiness>
}

function DesktopReadiness({ appearance }: { appearance: ReturnType<typeof useAppearance> }) {

    const { pending } = useReadiness<DesktopReadinessRequirement>()

    const covering = pending.length > 0

    const duration = appearance.transaction.duration

    // Once faded out, the cover leaves the tree. Kept at zero opacity, it
    // stayed a full-screen layer over the Desktop that repainted with every
    // frame of any animation, and its spinner never stopped.
    const [faded, setFaded] = useState(!covering)

    if (covering && faded) setFaded(false)

    if (!covering && !faded && duration === 0) setFaded(true)

    if (faded) return null

    return <Loading

        aria-hidden={!covering}

        className={covering ? "opacity-100" : "pointer-events-none opacity-0"}

        style={{
            // New pending work must cover the next representation
            // immediately; only completed readiness fades away.
            transitionDuration: covering ? "0ms" : String(duration) + "ms",
            transitionTimingFunction: cssEasing(appearance.transaction.easing),
            transitionProperty: "opacity"
        }}

        onTransitionEnd={event => {

            if (!covering && event.target === event.currentTarget && event.propertyName === "opacity") setFaded(true)
        }}

    >{pending[0]?.message ?? "Loading…"}</Loading>
}

function Desktop() {

    const application = ApplicationContext.useValue()
    const { preferences } = useDesktopPreferences()

    const [linkManager, setLinkManager] = useState<LinkManager | null>(null)

    const [connectionRevision, setConnectionRevision] = useState(0)

    const subscribe = useCallback(function () {

        return application.httpClient.onSubscribe<LinkManagerSnapshot>(function (link) {

            const manager = new LinkManager(application, link, link.payload, preferences)

            link.$internal.subscribeOnce("unsubscribe", () => {
                setLinkManager(current => current === manager ? null : current)
            })

            setLinkManager(manager)
        })
    }, [application, preferences])

    useEffect(subscribe, [subscribe])

    const connection = usePromise(async () => application.httpClient.subscribe(), [application, connectionRevision])

    if (connection.exception) return <FailedConnection

        exception={connection.exception.current}

        retry={() => setConnectionRevision(revision => revision + 1)}

    />

    if (!linkManager) return null

    return <ConnectedDesktop linkManager={linkManager} />
}

function FailedConnection({ exception, retry }: { exception: unknown, retry: () => void }) {

    useReady(connectionRequirement)

    useReady(sessionRequirement)

    useReady(wallpaperRequirement)

    return <Alert className="m-auto grid w-fit gap-3">

        <span>{String(exception)}</span>

        <button type="button" className="cursor-pointer justify-self-end" onClick={retry}>Try again</button>

    </Alert>
}

function ConnectedDesktop({ linkManager }: { linkManager: LinkManager }) {

    useReady(connectionRequirement)

    const { announced, update } = useDesktopPreferences()

    const inbound = ReactTunnel.useFactory(linkManager.$inbound)

    inbound.useSubscribe("/change-desktop-preferences", useCallback(function (change: DesktopPreferencesUpdate) {
        update(change)
    }, [update]))

    const appearance = useProperty(linkManager.appearance)

    useRememberSystemAppearance(appearance)

    useEffect(function () {
        void linkManager.updateDesktopPreferences(announced)
    }, [linkManager, announced])

    return <LinkManagerContext.Provider value={linkManager}>

        <Authentication />

    </LinkManagerContext.Provider>
}
