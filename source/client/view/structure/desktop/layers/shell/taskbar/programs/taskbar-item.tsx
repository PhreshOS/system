import { Button, type ButtonActionProps } from "@phreshos/react-ui"
import { type TaskbarPosition } from "@phreshos/core"
import { forwardRef, type ReactNode } from "react"

/**
 * A window on the Taskbar. The windows sit flat and translucent in the bar, so
 * the active one, raised in the primary color, is the one that stands out.
 */
export default forwardRef<HTMLButtonElement, TaskbarItemProps>(function TaskbarItem({ active = false, icon, position, children, className, ...props }, ref) {

    const horizontal = position === "top" || position === "bottom"

    return <Button

        ref={ref}
        aria-pressed={active}
        size="small"
        depth={active ? "raised" : "flat"}
        color={active ? "primary:soft" : undefined}
        material={active ? undefined : resting}
        className={`${horizontal ? "max-w-40 scroll-mx-8" : "w-full scroll-my-8 px-0"} ${className ?? ""}`}
        {...props}

    >

        <img src={icon} alt="" draggable={false} className="size-4 shrink-0 rounded-sm object-contain" />

        <span className={horizontal ? "truncate" : "sr-only"}>{children}</span>

    </Button>
})

/** The material of a window that is not active: mostly the bar shows through it. */
const resting = { opacity: 0.35 }

interface TaskbarItemProps extends Omit<ButtonActionProps, "children"> {

    active?: boolean

    // Every system entry has either its Program icon or the system default.
    icon: string

    position: TaskbarPosition

    children?: ReactNode
}
