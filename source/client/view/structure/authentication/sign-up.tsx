import { type AuthenticationState, type SignUpError } from "@server/core/authentication/authentication"
import CredentialsForm, { type CredentialsError } from "./credentials-form"
import { LinkManagerContext } from "../../contexts"
import usePromise from "@libs/react-promise"

export default function SignUp({ state, onClosed }: SignUpProps) {

    const linkManager = LinkManagerContext.useValue()

    const signUp = usePromise(async function (username: string, password: string) {

        const response = await linkManager.signUp(username, password)

        if ("error" in response && response.error === "signed-up") onClosed()

        return "error" in response ? resolveError(response.error, state) : null
    })

    return <CredentialsForm

        title="Set up your system"

        description="Create the credentials for this system's sole owner."

        submitLabel="Sign up"

        passwordAutocomplete="new-password"

        requirements={state.requirements}

        error={signUp.exception ? {

            target: "form",

            message: signUp.exception.current instanceof Error ? signUp.exception.current.message : String(signUp.exception.current)

        } : signUp.solve?.current}

        pending={signUp.isPending}

        onEdit={signUp.reset}

        onSubmit={signUp.safeExecute}

    />
}

function resolveError(error: SignUpError, state: AuthenticationState): CredentialsError {

    switch (error) {

        case "signed-up": return { target: "form", message: "Sign-up is already complete." }

        case "username-required": return { target: "username", message: "Enter a username." }

        case "username-invalid": return { target: "username", message: `Use a username of at most ${state.requirements.username.maximumLength} characters without control characters.` }

        case "password-too-short": return { target: "password", message: `Use at least ${state.requirements.password.minimumLength} characters.` }

        case "password-too-long": return { target: "password", message: `Use at most ${state.requirements.password.maximumLength} characters.` }

        case "password-matches-username": return { target: "password", message: "The password must not be the username." }
    }
}

interface SignUpProps {

    state: AuthenticationState

    onClosed: () => void
}
