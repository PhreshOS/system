import { forwardRef, ReactNode } from "react"
import { Surface, type SurfaceProps } from "@phreshos/react-ui"

/** The window-material shell shared by surfaces opened from the taskbar. */
export const taskbarSurfaceClassName = "m-0 isolate border-0 bg-transparent p-0 outline-none"

export default forwardRef<HTMLDivElement, TaskbarSurfaceProps>(function TaskbarSurface({ label, labelId, contentClassName = "", className, children, ...props }, ref) {

    return <Surface {...props} ref={ref} className={`grid min-h-0 max-h-[inherit] grid-rows-[auto_minmax(0,1fr)] ${className ?? ""}`}>

        <h2 id={labelId} className="relative grid h-10 items-center px-3.5 text-window-title font-medium select-none">{label}</h2>

        <Surface className={`relative m-1.5 mt-0 min-h-0 overflow-hidden ${contentClassName}`}>

            {children}

        </Surface>

    </Surface>
})

interface TaskbarSurfaceProps extends Omit<SurfaceProps, "children"> {

    label: string

    labelId: string

    contentClassName?: string

    children: ReactNode
}
