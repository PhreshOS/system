import { type AuthenticationState } from "@server/core/authentication/authentication"
import { surfaceLifecyclePose, surfacePresenceTransition } from "../../appearance/surface-presence"
import { useReducedMotion } from "@libs/react-motion"
import { motion } from "motion/react"
import { Button, Heading, Input, resolveSpacing, Surface, Text, useAppearance } from "@phreshos/react-ui"
import Alert from "../../components/alert"
import { useId, useState, type SyntheticEvent } from "react"
import logo from "@/assets/logo.png"
import { name, version } from "@/source/identity"

/** The common username-and-password welcome for sign-up and sign-in: the first thing a System shows. */
export default function CredentialsForm({ title, description, submitLabel, passwordAutocomplete, requirements, error, pending, onEdit, onSubmit }: CredentialsFormProps) {

    const reducedMotion = useReducedMotion()
    const { transaction, spacing } = useAppearance()
    const [password, setPassword] = useState("")
    const titleId = useId()
    const passwordReady = requirements === undefined || [...password].length >= requirements.password.minimumLength

    function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {

        event.preventDefault()

        if (pending) return

        const data = new FormData(event.currentTarget)

        onSubmit(String(data.get("username") ?? ""), String(data.get("password") ?? ""))
    }

    // A welcome, not a dialog: the System's mark and words lead, the fields follow, and the version
    // closes the card quietly. The card rises; its fields are recessed into it.
    return <div className="absolute inset-0 grid overflow-auto p-4">

        <motion.div

            initial={reducedMotion ? surfaceLifecyclePose.visible : surfaceLifecyclePose.hidden}

            animate={surfaceLifecyclePose.visible}

            transition={surfacePresenceTransition(reducedMotion, transaction)}

            className="pointer-events-auto relative m-auto w-[min(25rem,100%)]"

        >

            <Surface material="full" radius="large" className="w-full" style={{ padding: resolveSpacing("xlarge", spacing) }}>

                <form

                    className="grid"

                    style={{ gap: resolveSpacing("xlarge", spacing) }}

                    aria-busy={pending}

                    aria-labelledby={titleId}

                    // Authentication owns normalized credential validation. Native
                    // interception would prevent its field-specific result reaching this form.
                    noValidate

                    onSubmit={submit}

                >

                    <div className="grid justify-items-center text-center" style={{ gap: resolveSpacing("medium", spacing) }}>

                        <img src={logo} alt="" draggable={false} className="size-12 object-contain select-none" />

                        <div className="grid" style={{ gap: resolveSpacing("small", spacing) }}>

                            <Heading id={titleId} level={1} size="large">{title}</Heading>

                            <Text tone="secondary">{description}</Text>

                        </div>

                    </div>

                    <div className="grid" style={{ gap: resolveSpacing("large", spacing) }}>

                        {/* A submitted failure belongs to the exact credential values that produced it. */}
                        <Input
                            label="Username"
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
                            label="Password"
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

                    <Text size="small" tone="secondary" className="text-center select-none tabular-nums" aria-label={`${name} version ${version}`}>

                        {name} {version}

                    </Text>

                </form>

            </Surface>

        </motion.div>

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
