import AuthManager from "@client/core/link-manager/auth-manager/auth-manager"
import { AuthManagerContext, LinkManagerContext } from "../../contexts"
import Alert from "../../components/alert"
import usePromise from "@libs/react-promise"
import useStorage from "@libs/storage-hook"
import useCleanup from "@libs/cleanup-hook"
import Desktop from "../desktop/desktop"
import SignIn from "./sign-in"
import SignUp from "./sign-up"
import { useEffect, useState, type ReactNode } from "react"
import { type AuthenticationState } from "@server/core/authentication/authentication"
import { WallpaperStage } from "../desktop/layers/wallpaper/wallpaper"
import { useReady } from "@libs/readiness"
import { useThemedValue } from "@phreshos/react-ui"
import { useProperty } from "@the-link/react"

export default function () {

    const session = useStorage("session")

    const linkManager = LinkManagerContext.useValue()

    const appearance = useProperty(linkManager.appearance)

    const signInWallpaper = useThemedValue(appearance.signInWallpaper)

    const [revision, setRevision] = useState(0)

    useEffect(() => {

        const signedIn = linkManager.$inbound.subscribe("/session/signed-in", token => {

            if (typeof token === "string") session.update(token)
        })

        const signedOut = linkManager.$inbound.subscribe("/session/signed-out", () => session.remove())

        return () => {

            signedIn()
            signedOut()
        }

    }, [linkManager, session])

    const sessionAuthenticate = usePromise<SessionResolution>(async function () {

        const response = await linkManager.sessionAuthenticate(session.value)

        if (!response) {

            if (session.value !== null) session.remove()

            return { kind: "anonymous", authentication: await linkManager.authenticationState() }
        }

        const [sessionToken, payload] = response

        const authManager = new AuthManager(linkManager, sessionToken, payload)

        return { kind: "authenticated", authManager }

    }, [session.value, revision])

    useCleanup(() => {

        if (sessionAuthenticate.solve?.kind === "authenticated") sessionAuthenticate.solve.authManager.disconnect()

    }, [sessionAuthenticate.solve])

    if (sessionAuthenticate.isPending) return null

    if (sessionAuthenticate.exception) return <FailedSession>

        <Alert className="m-auto w-fit">

            {String(sessionAuthenticate.exception.current)}

        </Alert>

    </FailedSession>

    if (!sessionAuthenticate.solve) return null

    if (sessionAuthenticate.solve.kind === "anonymous") return <ReadySession>

        {sessionAuthenticate.solve.authentication.signedUp

            ? <WallpaperStage file={signInWallpaper}><SignIn /></WallpaperStage>

            : <WallpaperStage file={signInWallpaper}>

                <SignUp state={sessionAuthenticate.solve.authentication} onClosed={() => setRevision(value => value + 1)} />

            </WallpaperStage>}

    </ReadySession>

    return <ReadySession>

        <AuthManagerContext.Provider value={sessionAuthenticate.solve.authManager}>

            <Desktop />

        </AuthManagerContext.Provider>

    </ReadySession>
}

function ReadySession({ children }: { children: ReactNode }) {

    useReady("session")

    return children
}

function FailedSession({ children }: { children: ReactNode }) {

    useReady("session")

    useReady("wallpaper")

    return children
}

type SessionResolution = {

    kind: "anonymous"

    authentication: AuthenticationState

} | {

    kind: "authenticated"

    authManager: AuthManager
}
