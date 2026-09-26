import { forwardRef, ReactNode } from "react"
import { Panel, type PanelProps } from "@phreshos/react-ui"

/** Reset shared by independent surfaces presented in the Shell layer. */
export const shellSurfaceClassName = "isolate overflow-visible border-0 bg-transparent p-0 outline-none"

export default forwardRef<HTMLDivElement, ShellSurfaceProps>(function ShellSurface({ label, labelId, contentClassName = "", className, children, ...props }, ref) {

    return <Panel {...props} ref={ref} className={className}>
        <Panel.Header><h2 id={labelId} className="m-0 truncate text-window-title font-medium select-none">{label}</h2></Panel.Header>
        <Panel.Content className={contentClassName}>{children}</Panel.Content>
    </Panel>
})

interface ShellSurfaceProps extends Omit<PanelProps, "children"> {

    label: string

    labelId: string

    contentClassName?: string

    children: ReactNode
}
