import { forwardRef, ReactNode } from "react"
import { Surface, useAppearance, useResolveTheme, useScale, type SurfaceProps } from "@phreshos/react-ui"

/** The window-material shell shared by surfaces opened from the taskbar. */
export const taskbarSurfaceClassName = "m-0 isolate border-0 bg-transparent p-0 shadow-window-active outline-none"

export default forwardRef<HTMLDivElement, TaskbarSurfaceProps>(function TaskbarSurface({ label, labelId, contentClassName = "bg-white/25 shadow-window-content", className, children, ...props }, ref) {

    const contentRadius = useScale(useResolveTheme(useAppearance().radius)).medium

    return <Surface {...props} ref={ref} className={`grid min-h-0 max-h-[inherit] grid-rows-[auto_minmax(0,1fr)] ${className ?? ""}`}>

        <h2 id={labelId} className="relative grid h-10 items-center px-3.5 text-window-title font-medium select-none">{label}</h2>

        <div style={{ borderRadius: contentRadius }} className={`relative m-1.5 mt-0 min-h-0 overflow-hidden ${contentClassName}`}>

            {children}

        </div>

    </Surface>
})

interface TaskbarSurfaceProps extends Omit<SurfaceProps, "children"> {

    label: string

    labelId: string

    contentClassName?: string

    children: ReactNode
}
