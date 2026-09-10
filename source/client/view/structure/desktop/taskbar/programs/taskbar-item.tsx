import { Button, type ButtonProps } from "@phreshos/react-ui"
import { forwardRef, type ReactNode } from "react"

/**
 * A pressable item with a raised state. What "raised" means is the caller's.
 */
export default forwardRef<HTMLButtonElement, TaskbarItemProps>(function TaskbarItem({ active = false, icon, children, className, ...props }, ref) {

    return <Button

        ref={ref}
        aria-pressed={active}
        size="small"
        className={`relative max-w-40 scroll-mx-8 overflow-hidden ${className ?? ""}`}
        {...props}

    >

        <img src={icon} alt="" draggable={false} className="size-4 shrink-0 rounded-sm object-contain" />

        <span className="truncate">{children}</span>

        {active && <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-sky-500 shadow-taskbar-indicator" />}

    </Button>
})

export interface TaskbarItemProps extends Omit<ButtonProps, "children"> {

    active?: boolean

    // Every system entry has either its Program icon or the system default.
    icon: string

    children?: ReactNode
}
