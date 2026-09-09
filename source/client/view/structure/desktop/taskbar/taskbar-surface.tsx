import { forwardRef, ReactNode } from "react"
import { Panel, type PanelProps } from "@phreshos/react-ui"

/** The window-material shell shared by surfaces opened from the taskbar. */
export const taskbarSurfaceClassName = "m-0 isolate overflow-visible border-0 bg-transparent p-0 outline-none"

export default forwardRef<HTMLDivElement, TaskbarSurfaceProps>(function TaskbarSurface({ label, labelId, contentClassName = "", className, children, ...props }, ref) {

    return <Panel {...props} ref={ref} className={className}
        header={<h2 id={labelId} className="relative grid h-10 items-center px-3.5 text-window-title font-medium select-none">{label}</h2>}
        contentProps={{ className: contentClassName }}
    >{children}</Panel>
})

interface TaskbarSurfaceProps extends Omit<PanelProps, "children" | "header" | "contentProps"> {

    label: string

    labelId: string

    contentClassName?: string

    children: ReactNode
}
