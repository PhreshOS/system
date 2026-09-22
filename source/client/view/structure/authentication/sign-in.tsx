import CredentialsForm, { type CredentialsError } from "./credentials-form"
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

        error={resolveError(signIn.exception?.current, signIn.solve?.current)}

        pending={signIn.isPending}

        onEdit={signIn.reset}

        onSubmit={signIn.safeExecute}

    />
}

function resolveError(exception: unknown, signedIn: boolean | undefined): CredentialsError | null {

    if (exception !== undefined) return {

        target: "form",

        message: exception instanceof Error ? exception.message : String(exception)
    }

    if (signedIn === false) return {

        target: "credentials",

        message: "The username or password is incorrect."
    }

    return null
}
