import { Button, type ButtonProps } from "@phreshos/react-ui"
import { type TaskbarPosition } from "@phreshos/core"
import { forwardRef, type ReactNode } from "react"

/**
 * A pressable item with a raised state. What "raised" means is the caller's.
 */
export default forwardRef<HTMLButtonElement, TaskbarItemProps>(function TaskbarItem({ active = false, icon, position, children, className, ...props }, ref) {

    const horizontal = position === "top" || position === "bottom"

    const indicator = taskbarIndicatorClassName(position)

    return <Button

        ref={ref}
        aria-pressed={active}
        size="small"
        className={`relative overflow-hidden ${horizontal ? "max-w-40 scroll-mx-8" : "w-full scroll-my-8 px-0"} ${className ?? ""}`}
        {...props}

    >

        <img src={icon} alt="" draggable={false} className="size-4 shrink-0 rounded-sm object-contain" />

        <span className={horizontal ? "truncate" : "sr-only"}>{children}</span>

        {active && <span aria-hidden="true" className={`absolute ${indicator} rounded-full bg-sky-500 shadow-taskbar-indicator`} />}

    </Button>
})

/** The active mark stays on the same screen edge as its Taskbar. */
export function taskbarIndicatorClassName(position: TaskbarPosition) {
    if (position === "top") return "inset-x-3 top-0 h-0.5"
    if (position === "bottom") return "inset-x-3 bottom-0 h-0.5"
    if (position === "left") return "inset-y-3 left-0 w-0.5"
    return "inset-y-3 right-0 w-0.5"
}

export interface TaskbarItemProps extends Omit<ButtonProps, "children"> {

    active?: boolean

    // Every system entry has either its Program icon or the system default.
    icon: string

    position: TaskbarPosition

    children?: ReactNode
}
