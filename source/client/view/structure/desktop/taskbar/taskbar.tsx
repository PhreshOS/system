import { ReactNode } from "react"
import { Surface, type SurfaceProps } from "@phreshos/react-ui"
import TaskbarSeparator from "./taskbar-separator"

/**
 * The desktop's persistent control surface. Leading, primary and trailing
 * regions are structural; what each region means belongs to the caller.
 */
export default function Taskbar({ leading, trailing, dialogs, className, children, ...props }: TaskbarProps) {

    return <Surface

        className={`relative isolate grid h-taskbar min-w-0 grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-1.5 p-1.5 [anchor-name:--desktop-taskbar] ${className ?? ""}`}

        {...props}

    >

        {leading}

        <TaskbarSeparator />

        {children}

        <TaskbarSeparator />

        {trailing}

        {dialogs}

    </Surface>
}

interface TaskbarProps extends SurfaceProps {

    leading: ReactNode

    trailing: ReactNode

    dialogs?: ReactNode
}
