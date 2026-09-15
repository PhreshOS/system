import { AuthManagerContext } from "@client/view/contexts"
import usePromise from "@libs/react-promise"
import { ComponentProps, memo } from "react"
import TaskbarButton from "../taskbar-button"

export default memo(function (props: ComponentProps<typeof TaskbarButton>) {

    const authManager = AuthManagerContext.useValue()

    const signOut = usePromise(() => authManager.signOut())

    return <TaskbarButton

        aria-label="Sign out"

        disabled={signOut.isPending}

        onPress={signOut.safeExecute}

        {...props}

    >

        <span className="hidden text-taskbar-label font-medium sm:inline">Sign out</span>

    </TaskbarButton>
})
