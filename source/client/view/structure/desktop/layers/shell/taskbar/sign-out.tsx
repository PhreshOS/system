import { AuthManagerContext } from "@client/view/contexts"
import usePromise from "@libs/react-promise"
import { type ComponentProps, memo } from "react"
import TaskbarButton from "./taskbar-button"

export default memo(function ({ showLabel = true, ...props }: SignOutProps) {

    const authManager = AuthManagerContext.useValue()

    const signOut = usePromise(() => authManager.signOut())

    return <TaskbarButton

        icon={<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="block size-full">

            <path d="M7 2.5H3.5v11H7" />

            <path d="M6 8h6.5m-2.25-2.25L12.5 8l-2.25 2.25" />

        </svg>}

        label="Sign out"

        showLabel={showLabel}

        color="danger:base"

        aria-label="Sign out"

        disabled={signOut.isPending}

        onPress={signOut.safeExecute}

        {...props}

    />
})

interface SignOutProps extends Omit<ComponentProps<typeof TaskbarButton>, "icon" | "label" | "showLabel"> {
    showLabel?: boolean
}
