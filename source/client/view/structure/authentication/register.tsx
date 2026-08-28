import { type AuthenticationState, type RegistrationError } from "@server/core/authentication/authentication"
import CredentialsForm from "./credentials-form"
import { LinkManagerContext } from "../../contexts"
import usePromise from "@libs/react-promise"
import useStorage from "@libs/storage-hook"

export default function Register({ state, onClosed }: RegisterProps) {

    const authorization = useStorage("authorization")

    const linkManager = LinkManagerContext.useValue()

    const registration = usePromise(async function (username: string, password: string) {

        const response = await linkManager.register(username, password)

        if ("authorization" in response) authorization.update(response.authorization)

        else if (response.error === "registered") onClosed()

        return "error" in response ? message(response.error, state) : null
    })

    return <CredentialsForm

        title="Set up your system"

        description="Create the credentials for this system's sole owner."

        submitLabel="Register"

        passwordAutocomplete="new-password"

        requirements={state.requirements}

        error={registration.exception ? String(registration.exception.current) : registration.solve?.current}

        pending={registration.isPending}

        onSubmit={registration.safeExecute}

    />
}

function message(error: RegistrationError, state: AuthenticationState) {

    switch (error) {

        case "registered": return "Registration is already complete."

        case "username-required": return "Enter a username."

        case "username-invalid": return `Use a username of at most ${state.requirements.username.maximumLength} characters without control characters.`

        case "password-too-short": return `Use at least ${state.requirements.password.minimumLength} characters.`

        case "password-too-long": return `Use at most ${state.requirements.password.maximumLength} characters.`

        case "password-matches-username": return "The password must not be the username."
    }
}

interface RegisterProps {

    state: AuthenticationState

    onClosed: () => void
}
