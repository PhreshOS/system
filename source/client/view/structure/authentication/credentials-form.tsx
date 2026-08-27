import { type AuthenticationState } from "@server/core/authentication/authentication"
import { enterSurface, prepareSurfaceEntrance, restSurface } from "../../appearance/surface-presence"
import { useReducedMotion } from "@libs/react-motion"
import { Surface, useTheme } from "@phreshos/react-ui"
import { numericScale } from "@phreshos/core"
import { obscuredBackground } from "../../components/loading"
import Alert from "../../components/alert"
import { type SyntheticEvent, useLayoutEffect, useRef } from "react"

/** The common username-and-password surface for registration and sign-in. */
export default function CredentialsForm({ title, description, submitLabel, passwordAutocomplete, requirements, error, onSubmit }: CredentialsFormProps) {

    const surface = useRef<HTMLFormElement>(null)

    const reducedMotion = useReducedMotion()

    const radius = numericScale(useTheme().radius)

    const outerRadius = radius.large

    const innerRadius = radius.medium

    useLayoutEffect(function () {

        prepareSurfaceEntrance(surface.current, reducedMotion)

        const entrance = enterSurface(surface.current, reducedMotion)

        return () => {

            entrance?.kill()

            restSurface(surface.current)
        }

    }, [reducedMotion])

    function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {

        event.preventDefault()

        const data = new FormData(event.currentTarget)

        onSubmit(String(data.get("username") ?? ""), String(data.get("password") ?? ""))
    }

    return <div className={`absolute inset-0 grid ${obscuredBackground}`}>

        <form

            ref={surface}

            style={{ borderRadius: outerRadius }}

            className="relative isolate m-auto grid w-[min(24rem,calc(100%-2rem))] grid-rows-[auto_minmax(0,1fr)] overflow-hidden text-slate-800 shadow-window-active"

            onSubmit={submit}

        >

            <Surface aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit]" />

            <div className="relative grid gap-1 px-5 py-4">

                <h1 className="text-xl font-semibold">{title}</h1>

                <p className="text-sm leading-5 text-slate-600/90">{description}</p>

            </div>

            <div style={{ borderRadius: innerRadius }} className="relative m-1.5 mt-0 grid gap-5 bg-white/25 p-5 shadow-window-content">

                <div className="grid gap-4">

                    <label className="grid gap-1.5 text-sm font-medium">

                        Username

                        <input

                            name="username"

                            type="text"

                            autoComplete="username"

                            minLength={requirements?.username.minimumLength}

                            maxLength={requirements?.username.maximumLength}

                            required

                            autoFocus

                            className="h-10 rounded-lg border border-white/70 bg-white/70 px-3 font-normal shadow-window-content outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200/80"

                        />

                    </label>

                    <label className="grid gap-1.5 text-sm font-medium">

                        Password

                        <input

                            name="password"

                            type="password"

                            autoComplete={passwordAutocomplete}

                            minLength={requirements?.password.minimumLength}

                            maxLength={requirements?.password.maximumLength}

                            required

                            className="h-10 rounded-lg border border-white/70 bg-white/70 px-3 font-normal shadow-window-content outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200/80"

                        />

                        {requirements && <span className="font-normal text-slate-500">

                            Use at least {requirements.password.minimumLength} characters.

                        </span>}

                    </label>

                </div>

                {error && <Alert className="border-red-200/70 bg-red-50/70 text-sm text-red-700">{error}</Alert>}

                <button

                    type="submit"

                    className="h-10 cursor-pointer rounded-lg border border-sky-700/35 from-sky-500 to-sky-600 px-4 font-medium text-white shadow-taskbar-control outline-none hover:from-sky-400 hover:to-sky-500 focus-visible:ring-2 focus-visible:ring-white/90"

                >

                    {submitLabel}

                </button>

            </div>

        </form>

    </div>
}

interface CredentialsFormProps {

    title: string

    description: string

    submitLabel: string

    passwordAutocomplete: "current-password" | "new-password"

    requirements?: AuthenticationState["requirements"]

    error?: string | null

    onSubmit: (username: string, password: string) => void
}
