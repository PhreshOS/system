import AuthManager from "@client/core/link-manager/auth-manager/auth-manager"
import { AuthManagerContext, LinkManagerContext } from "../../contexts"
import Loading from "../../components/loading"
import Alert from "../../components/alert"
import usePromise from "@libs/react-promise"
import useStorage from "@libs/storage-hook"
import useCleanup from "@libs/cleanup-hook"
import Workspace from "../workspace"
import SignIn from "./sign-in"
import Register from "./register"
import { useState } from "react"
import { type AuthenticationState } from "@server/core/authentication/authentication"
import useProperty from "@libs/the-link/plugins/react-helper/property-hook"
import { WallpaperStage } from "../../components/wallpaper"

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

    if (sessionAuthenticate.isPending) return <Loading />

    if (sessionAuthenticate.exception) return <Alert className="m-auto w-fit">

        {String(sessionAuthenticate.exception.current)}

    </Alert>

    if (!sessionAuthenticate.solve) return <Loading />

    if (sessionAuthenticate.solve.kind === "anonymous") return sessionAuthenticate.solve.authentication.registered

        ? <WallpaperStage file={signInWallpaper}><SignIn /></WallpaperStage>

        : <WallpaperStage file={signInWallpaper}><Register state={sessionAuthenticate.solve.authentication} onClosed={() => setRevision(value => value + 1)} /></WallpaperStage>

    return <AuthManagerContext.Provider value={sessionAuthenticate.solve.authManager}>

        <Workspace />

    </AuthManagerContext.Provider>
}

type SessionResolution = {

    kind: "anonymous"

    authentication: AuthenticationState

} | {

    kind: "authenticated"

    authManager: AuthManager
}
