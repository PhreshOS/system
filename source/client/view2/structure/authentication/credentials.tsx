import { Alert, Button, Description, FieldError, Form, Input, Label, Spinner, TextField } from "@heroui/react"
import { LinkManagerContext } from "../../contexts"
import usePromise from "@libs/react-promise"
import useStorage from "@libs/storage-hook"
import { type AuthenticationState, type RegistrationError } from "@server/core/authentication/authentication"

export default function ({ mode, requirements, onRegistered }: CredentialsProps) {

    const linkManager = LinkManagerContext.useValue()

    const authorization = useStorage("authorization")

    const submission = usePromise(async function (username: string, password: string) {

        if (mode === "sign-in") {

            const token = await linkManager.signIn(username, password)

            if (token) authorization.update(token)

            return token ? null : "The username or password is incorrect."
        }

        const response = await linkManager.register(username, password)

        if ("authorization" in response) authorization.update(response.authorization)

        else if (response.error === "registered") onRegistered()

        return "error" in response ? registrationMessage(response.error, requirements) : null
    })

    function submit(data: FormData) {

        void submission.safeExecute(String(data.get("username") ?? ""), String(data.get("password") ?? ""))
    }

    const register = mode === "register"

    const error = submission.exception

        ? submission.exception.current instanceof Error ? submission.exception.current.message : String(submission.exception.current)

        : submission.solve?.current

    return <Form aria-label={register ? "Create owner account" : "Sign in"} onSubmit={event => {

        event.preventDefault()

        submit(new FormData(event.currentTarget))

    }} className="grid w-[min(24rem,calc(100%-2rem))] place-self-center gap-5 p-6">

        <h1 className="text-2xl font-semibold">{register ? "Set up PhreshOS" : "Welcome back"}</h1>

        <p className="text-muted">{register ? "Create the credentials for this system's owner." : "Sign in as the system owner."}</p>

        <TextField fullWidth isRequired name="username" minLength={requirements.username.minimumLength} maxLength={requirements.username.maximumLength}>

            <Label>Username</Label>

            <Input autoFocus autoComplete="username" />

            <FieldError />

        </TextField>

        <TextField fullWidth isRequired name="password" type="password" minLength={requirements.password.minimumLength} maxLength={requirements.password.maximumLength}>

            <Label>Password</Label>

            <Input autoComplete={register ? "new-password" : "current-password"} />

            {register && <Description>Use at least {requirements.password.minimumLength} characters.</Description>}

            <FieldError />

        </TextField>

        {error && <Alert status="danger">

            <Alert.Indicator />

            <Alert.Content><Alert.Description>{error}</Alert.Description></Alert.Content>

        </Alert>}

        <Button fullWidth type="submit" isDisabled={submission.isPending}>

            {submission.isPending && <Spinner size="sm" color="current" />}

            {register ? "Create owner" : "Sign in"}

        </Button>

    </Form>
}

function registrationMessage(error: RegistrationError, requirements: AuthenticationState["requirements"]) {

    switch (error) {

        case "registered": return "Registration is already complete."

        case "username-required": return "Enter a username."

        case "username-invalid": return `Use a username of at most ${requirements.username.maximumLength} characters without control characters.`

        case "password-too-short": return `Use at least ${requirements.password.minimumLength} characters.`

        case "password-too-long": return `Use at most ${requirements.password.maximumLength} characters.`

        case "password-matches-username": return "The password must not be the username."
    }
}

interface CredentialsProps {

    mode: "register" | "sign-in"

    requirements: AuthenticationState["requirements"]

    onRegistered: () => void
}
