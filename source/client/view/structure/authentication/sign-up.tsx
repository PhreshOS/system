import { type AuthenticationState, type SignUpError } from "@server/core/authentication/authentication"
import CredentialsForm from "./credentials-form"
import { LinkManagerContext } from "../../contexts"
import usePromise from "@libs/react-promise"

export default function SignUp({ state, onClosed }: SignUpProps) {

    const linkManager = LinkManagerContext.useValue()

    const signUp = usePromise(async function (username: string, password: string) {

        const response = await linkManager.signUp(username, password)

        if ("error" in response && response.error === "signed-up") onClosed()

        return "error" in response ? message(response.error, state) : null
    })

    return <CredentialsForm

        title="Set up your system"

        description="Create the credentials for this system's sole owner."

        submitLabel="Sign up"

        passwordAutocomplete="new-password"

        requirements={state.requirements}

        error={signUp.exception ? String(signUp.exception.current) : signUp.solve?.current}

        pending={signUp.isPending}

        onSubmit={signUp.safeExecute}

    />
}

function message(error: SignUpError, state: AuthenticationState) {

    switch (error) {

        case "signed-up": return "Sign-up is already complete."

        case "username-required": return "Enter a username."

        case "username-invalid": return `Use a username of at most ${state.requirements.username.maximumLength} characters without control characters.`

        case "password-too-short": return `Use at least ${state.requirements.password.minimumLength} characters.`

        case "password-too-long": return `Use at most ${state.requirements.password.maximumLength} characters.`

        case "password-matches-username": return "The password must not be the username."
    }
}

interface SignUpProps {

    state: AuthenticationState

    onClosed: () => void
}
