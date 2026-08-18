import { ComponentProps, ReactNode } from "react"
import { GlassSurface, useTheme } from "@phreshos/react-ui"
import { numericScale } from "@phreshos/core"
import { taskbarAnchorName } from "../geometry"
import TaskbarSeparator from "./taskbar-separator"

/**
 * The desktop's persistent control surface. Leading, primary and trailing
 * regions are structural; what each region means belongs to the caller.
 */
export default function Taskbar({ leading, trailing, dialogs, className, style, children, ...props }: TaskbarProps) {

    const radius = numericScale(useTheme().radius).large

    return <section

        className={`relative isolate h-taskbar border border-white/30 shadow-taskbar ${className ?? ""}`}

        style={{ anchorName: taskbarAnchorName, ...style, borderRadius: radius }}

        {...props}

    >

        <GlassSurface aria-hidden="true" radius="inherit" className="pointer-events-none absolute inset-0" />

        <div className="relative grid h-full min-w-0 grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-1.5 p-2">

            {leading}

            <TaskbarSeparator />

            {children}

            <TaskbarSeparator />

            {trailing}

        </div>

        {dialogs}

    </section>
}

interface TaskbarProps extends ComponentProps<"section"> {

    leading: ReactNode

    trailing: ReactNode

    dialogs?: ReactNode
}
