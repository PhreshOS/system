import { type AuthenticationState } from "@server/core/authentication/authentication"
import { surfaceLifecyclePose, surfacePresenceTransition } from "../../appearance/surface-presence"
import { useReducedMotion } from "@libs/react-motion"
import { motion } from "motion/react"
import { Button, Input, Panel, useAppearance } from "@phreshos/react-ui"
import Alert from "../../components/alert"
import { useState, type SyntheticEvent } from "react"
import { ApplicationContext } from "../../contexts"
import SystemHeader from "../../components/system-header"

/** The common username-and-password surface for sign-up and sign-in. */
export default function CredentialsForm({ title, description, submitLabel, passwordAutocomplete, requirements, error, pending, onEdit, onSubmit }: CredentialsFormProps) {

    const reducedMotion = useReducedMotion()
    const transaction = useAppearance().transaction
    const application = ApplicationContext.useValue()
    const [password, setPassword] = useState("")
    const passwordReady = requirements === undefined || [...password].length >= requirements.password.minimumLength

    function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {

        event.preventDefault()

        if (pending) return

        const data = new FormData(event.currentTarget)

        onSubmit(String(data.get("username") ?? ""), String(data.get("password") ?? ""))
    }

    return <div className="absolute inset-0 grid">

        <motion.form

            initial={reducedMotion ? surfaceLifecyclePose.visible : surfaceLifecyclePose.hidden}

            animate={surfaceLifecyclePose.visible}

            transition={surfacePresenceTransition(reducedMotion, transaction)}

            className="pointer-events-auto relative m-auto w-[min(24rem,calc(100%-2rem))]"

            aria-busy={pending}

            // Authentication owns normalized credential validation. Native
            // interception would prevent its field-specific result reaching this form.
            noValidate

            onSubmit={submit}

        >

            <Panel material="full">

                <Panel.Header><SystemHeader name={application.displayName} version={application.version} /></Panel.Header>

                <Panel.Content material="extended" className="grid gap-5 p-5">

                <div className="grid gap-1">

                    <h1 className="text-xl font-semibold">{title}</h1>

                    <p className="text-sm leading-5 opacity-60">{description}</p>

                </div>

                <div className="grid gap-4">

                    {/* A submitted failure belongs to the exact credential values that produced it. */}
                    <Input
                        aria-label="Username"
                        placeholder="Username"
                        size="large"
                        name="username"
                        type="text"
                        autoComplete="username"
                        minLength={requirements?.username.minimumLength}
                        maxLength={requirements?.username.maximumLength}
                        required
                        disabled={pending}
                        invalid={error?.target === "username" || error?.target === "credentials"}
                        errorMessage={error?.target === "username" ? error.message : undefined}
                        onChange={() => onEdit?.()}
                        autoFocus
                    />

                    <Input
                        aria-label="Password"
                        placeholder="Password"
                        size="large"
                        name="password"
                        type="password"
                        autoComplete={passwordAutocomplete}
                        minLength={requirements?.password.minimumLength}
                        maxLength={requirements?.password.maximumLength}
                        required
                        disabled={pending}
                        invalid={error?.target === "password" || error?.target === "credentials"}
                        errorMessage={error?.target === "password" ? error.message : undefined}
                        onChange={value => {

                            // This controls registration readiness only; Authentication
                            // remains the authority for accepting the submitted value.
                            setPassword(value)
                            onEdit?.()
                        }}
                        description={requirements ? `Use at least ${requirements.password.minimumLength} characters.` : undefined}
                    />

                </div>

                {(error?.target === "credentials" || error?.target === "form") && <Alert className="text-sm">{error.message}</Alert>}

                <Button

                    type="submit"

                    disabled={!passwordReady}

                    pending={pending}

                    size="large"

                    color="primary:base"

                    style={{ width: "100%" }}

                >{pending ? `${submitLabel}…` : submitLabel}</Button>

                </Panel.Content>

            </Panel>

        </motion.form>

    </div>
}

interface CredentialsFormProps {

    title: string

    description: string

    submitLabel: string

    passwordAutocomplete: "current-password" | "new-password"

    requirements?: AuthenticationState["requirements"]

    error?: CredentialsError | null

    pending: boolean

    onEdit?: () => void

    onSubmit: (username: string, password: string) => void
}

export interface CredentialsError {

    target: "username" | "password" | "credentials" | "form"

    message: string
}
