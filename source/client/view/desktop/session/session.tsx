import AuthManager from "@client/core/link-manager/auth-manager/auth-manager"
import { AuthManagerContext, LinkManagerContext } from "../../contexts"
import Alert from "../../components/alert"
import usePromise from "@libs/react-promise"
import useStorage from "@libs/storage-hook"
import useCleanup from "@libs/cleanup-hook"
import Workspace from "../workspace"
import SignIn from "./sign-in"
import Register from "./register"
import { useState, type ReactNode } from "react"
import { type AuthenticationState } from "@server/core/authentication/authentication"
import useProperty from "@libs/the-link/plugins/react-helper/property-hook"
import { WallpaperStage } from "../../components/wallpaper"
import { useReady } from "@libs/readiness/main"

export default function () {

    const authorization = useStorage("authorization")

    const linkManager = LinkManagerContext.useValue()

    const signInWallpaper = useProperty(linkManager.signInWallpaper)

    const [revision, setRevision] = useState(0)

    const sessionAuthenticate = usePromise<SessionResolution>(async function () {

        const response = await linkManager.sessionAuthenticate(authorization.value)

        if (!response) return { kind: "anonymous", authentication: await linkManager.authenticationState() }

        const [authorizationToken, payload] = response

        const authManager = new AuthManager(linkManager, authorizationToken, payload)

        return { kind: "authenticated", authManager }

    }, [authorization.value, revision])

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

        {sessionAuthenticate.solve.authentication.registered

            ? <WallpaperStage file={signInWallpaper}><SignIn /></WallpaperStage>

            : <WallpaperStage file={signInWallpaper}>

                <Register state={sessionAuthenticate.solve.authentication} onClosed={() => setRevision(value => value + 1)} />

            </WallpaperStage>}

    </ReadySession>

    return <ReadySession>

        <AuthManagerContext.Provider value={sessionAuthenticate.solve.authManager}>

            <Workspace />

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
