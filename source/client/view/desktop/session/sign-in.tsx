import CredentialsForm from "./credentials-form"
import { LinkManagerContext } from "../../contexts"
import Loading from "../../components/loading"
import usePromise from "@libs/react-promise"
import useStorage from "@libs/storage-hook"

export default function () {

    const authorization = useStorage("authorization")

    const linkManager = LinkManagerContext.useValue()

    const signIn = usePromise(async function (username: string, password: string) {

        const authorizationToken = await linkManager.signIn(username, password)

        if (authorizationToken) authorization.update(authorizationToken)

        return !!authorizationToken
    })

    if (signIn.isPending) return <Loading />

    return <CredentialsForm

        title="Sign in"

        description="Enter the credentials for this system's owner."

        submitLabel="Sign in"

        passwordAutocomplete="current-password"

        error={signIn.exception ? String(signIn.exception.current) : signIn.solve && !signIn.solve.current ? "The username or password is incorrect." : null}

        onSubmit={signIn.safeExecute}

    />
}
