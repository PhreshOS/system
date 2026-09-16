import { type AuthenticationState } from "@server/core/authentication/authentication"
import { surfacePresencePose, surfacePresenceTransition } from "../../appearance/surface-presence"
import { useReducedMotion } from "@libs/react-motion"
import { motion } from "motion/react"
import { Button, Input, Panel, useAppearance } from "@phreshos/react-ui"
import Alert from "../../components/alert"
import { type SyntheticEvent } from "react"
import { ApplicationContext } from "../../contexts"
import SystemHeader from "../../components/system-header"

/** The common username-and-password surface for sign-up and sign-in. */
export default function CredentialsForm({ title, description, submitLabel, passwordAutocomplete, requirements, error, pending, onSubmit }: CredentialsFormProps) {

    const reducedMotion = useReducedMotion()
    const transaction = useAppearance().transaction
    const application = ApplicationContext.useValue()

    function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {

        event.preventDefault()

        if (pending) return

        const data = new FormData(event.currentTarget)

        onSubmit(String(data.get("username") ?? ""), String(data.get("password") ?? ""))
    }

    return <div className="absolute inset-0 grid">

        <motion.form

            initial={reducedMotion ? surfacePresencePose.entered : surfacePresencePose.entering}

            animate={surfacePresencePose.entered}

            transition={surfacePresenceTransition(reducedMotion, transaction)}

            className="pointer-events-auto relative m-auto w-[min(24rem,calc(100%-2rem))]"

            aria-busy={pending}

            onSubmit={submit}

        >

            <Panel header={<SystemHeader name={application.displayName} version={application.version} />} contentProps={{ className: "grid gap-5 p-5" }}>

                <div className="grid gap-1">

                    <h1 className="text-xl font-semibold">{title}</h1>

                    <p className="text-sm leading-5 opacity-60">{description}</p>

                </div>

                <div className="grid gap-4">

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
                        description={requirements ? `Use at least ${requirements.password.minimumLength} characters.` : undefined}
                    />

                </div>

                {error && <Alert className="text-sm">{error}</Alert>}

                <Button

                    type="submit"

                    disabled={pending}

                    pending={pending}

                    size="large"

                    color="primary:base"

                    style={{ width: "100%" }}

                >{pending ? `${submitLabel}…` : submitLabel}</Button>

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

    error?: string | null

    pending: boolean

    onSubmit: (username: string, password: string) => void
}
