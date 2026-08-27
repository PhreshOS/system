import { ReactNode } from "react"
import { Surface, useAppearance, useResolveTheme, useScale, type SurfaceProps } from "@phreshos/react-ui"
import TaskbarSeparator from "./taskbar-separator"

/**
 * The desktop's persistent control surface. Leading, primary and trailing
 * regions are structural; what each region means belongs to the caller.
 */
export default function Taskbar({ leading, trailing, dialogs, className, style, children, ...props }: TaskbarProps) {

    const radius = useScale(useResolveTheme(useAppearance().radius)).large

    return <Surface

        className={`relative isolate h-taskbar overflow-hidden shadow-taskbar [anchor-name:--desktop-taskbar] ${className ?? ""}`}

        style={{ ...style, borderRadius: radius }}

        {...props}

    >

        <div className="relative grid h-full min-w-0 grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-1.5 p-1.5">

            {leading}

            <TaskbarSeparator />

            {children}

            <TaskbarSeparator />

            {trailing}

        </div>

        {dialogs}

    </Surface>
}

interface TaskbarProps extends SurfaceProps {

    leading: ReactNode

    trailing: ReactNode

    dialogs?: ReactNode
}
