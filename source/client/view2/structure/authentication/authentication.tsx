import AuthManager from "@client/core/link-manager/auth-manager/auth-manager"
import { AuthManagerContext, LinkManagerContext } from "../../contexts"
import { Spinner } from "@heroui/react"
import Credentials from "./credentials"
import Desktop from "../desktop/desktop"
import Failure from "../../components/failure"
import usePromise from "@libs/react-promise"
import useStorage from "@libs/storage-hook"
import { useEffect, useState } from "react"
import { type AuthenticationState } from "@server/core/authentication/authentication"

export default function () {

    const linkManager = LinkManagerContext.useValue()

    const authorization = useStorage("authorization")

    const [revision, setRevision] = useState(0)

    const session = usePromise<Session>(async function () {

        const response = await linkManager.sessionAuthenticate(authorization.value)

        if (!response) return {

            kind: "anonymous",

            state: await linkManager.authenticationState()
        }

        const [token, payload] = response

        return {

            kind: "authenticated",

            manager: new AuthManager(linkManager, token, payload)
        }

    }, [linkManager, authorization.value, revision])

    useEffect(function () {

        if (session.solve?.kind !== "authenticated") return

        const manager = session.solve.manager

        return () => manager.disconnect()

    }, [session.solve])

    if (session.isPending) return <Spinner aria-label="Restoring your session" className="place-self-center" />

    if (session.exception) return <Failure title="Your session could not be restored" error={session.exception.current} retry={session.safeExecute} />

    if (session.solve.kind === "authenticated") return <AuthManagerContext.Provider value={session.solve.manager}>

        <Desktop />

    </AuthManagerContext.Provider>

    return <Credentials

        mode={session.solve.state.registered ? "sign-in" : "register"}

        requirements={session.solve.state.requirements}

        onRegistered={() => setRevision(current => current + 1)}

    />
}

type Session = {

    kind: "anonymous"

    state: AuthenticationState

} | {

    kind: "authenticated"

    manager: AuthManager
}
