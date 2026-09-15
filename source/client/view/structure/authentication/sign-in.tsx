import CredentialsForm from "./credentials-form"
import { LinkManagerContext } from "../../contexts"
import usePromise from "@libs/react-promise"

export default function () {

    const linkManager = LinkManagerContext.useValue()

    const signIn = usePromise(async function (username: string, password: string) {

        return await linkManager.signIn(username, password)
    })

    return <CredentialsForm

        title="Sign in"

        description="Enter the credentials for this system's owner."

        submitLabel="Sign in"

        passwordAutocomplete="current-password"

        error={signIn.exception ? String(signIn.exception.current) : signIn.solve && !signIn.solve.current ? "The username or password is incorrect." : null}

        pending={signIn.isPending}

        onSubmit={signIn.safeExecute}

    />
}
