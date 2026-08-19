import AuthManager from "@client/core/link-manager/auth-manager/auth-manager"
import { AuthManagerContext, LinkManagerContext } from "../../contexts"
import Alert from "../../components/alert"
import usePromise from "@libs/react-promise"
import useStorage from "@libs/storage-hook"
import useCleanup from "@libs/cleanup-hook"
import Workspace from "../workspace"
import SignIn from "./sign-in"
import Register from "./register"
import { useEffect, useState } from "react"
import { type AuthenticationState } from "@server/core/authentication/authentication"
import useProperty from "@libs/the-link/plugins/react-helper/property-hook"
import { WallpaperStage } from "../../components/wallpaper"
import { useReadiness } from "@libs/readiness/main"

export default function () {

    const authorization = useStorage("authorization")

    const linkManager = LinkManagerContext.useValue()

    const signInWallpaper = useProperty(linkManager.signInWallpaper)

    const [revision, setRevision] = useState(0)

    const { ready } = useReadiness()

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

    const failed = sessionAuthenticate.exception !== undefined

    useEffect(function () {

        if (sessionAuthenticate.isPending) return

        ready("session")

        if (failed) ready("wallpaper")
    }, [failed, ready, sessionAuthenticate.isPending])

    if (sessionAuthenticate.isPending) return null

    if (sessionAuthenticate.exception) return <Alert className="m-auto w-fit">

        {String(sessionAuthenticate.exception.current)}

    </Alert>

    if (!sessionAuthenticate.solve) return null

    if (sessionAuthenticate.solve.kind === "anonymous") return sessionAuthenticate.solve.authentication.registered

        ? <WallpaperStage file={signInWallpaper} onReady={() => ready("wallpaper")}><SignIn /></WallpaperStage>

        : <WallpaperStage file={signInWallpaper} onReady={() => ready("wallpaper")}><Register state={sessionAuthenticate.solve.authentication} onClosed={() => setRevision(value => value + 1)} /></WallpaperStage>

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
