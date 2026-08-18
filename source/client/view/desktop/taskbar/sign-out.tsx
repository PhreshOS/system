import useStorage from "@libs/storage-hook"
import { ComponentProps, memo } from "react"
import TaskbarButton from "./taskbar-button"

export default memo(function (props: ComponentProps<typeof TaskbarButton>) {

    const authorization = useStorage("authorization")

    return <TaskbarButton

        aria-label="Sign out"

        title="Sign out"

        onClick={authorization.remove}

        {...props}

    >

        <span className="hidden text-taskbar-label font-medium sm:inline">Sign out</span>

    </TaskbarButton>
})
