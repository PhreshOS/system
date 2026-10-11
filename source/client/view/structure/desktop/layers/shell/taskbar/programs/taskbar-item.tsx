import { Button, type ButtonActionProps } from "@phreshos/react-ui"
import { type TaskbarPosition } from "@phreshos/core"
import { forwardRef, type ReactNode } from "react"

/**
 * A window on the Taskbar, or a pinned Program with no window. The windows sit flat and translucent
 * in the bar, so the active one, raised in the primary color, is the one that stands out; a Program
 * with no window is its icon alone, part of the bar until pointed at.
 */
export default forwardRef<HTMLButtonElement, TaskbarItemProps>(function TaskbarItem({ active = false, closed = false, icon, position, labeled = true, children, className, ...props }, ref) {

    const horizontal = position === "top" || position === "bottom"

    // Its name beside its icon on a Taskbar lying along a wide screen; its icon alone otherwise.
    const named = horizontal && labeled

    return <Button

        ref={ref}
        aria-pressed={active}
        size="small"
        depth={active ? "raised" : closed ? "none" : "flat"}
        color={active ? "primary:soft" : undefined}
        material={active ? undefined : resting}
        iconOnly={horizontal && !named}
        className={`${named ? "max-w-40 scroll-mx-8" : horizontal ? "scroll-mx-8" : "w-full scroll-my-8 px-0"} ${className ?? ""}`}
        {...props}

    >

        <img src={icon} alt="" draggable={false} className="size-4 shrink-0 rounded-sm object-contain" />

        <span className={named ? "truncate" : "sr-only"}>{children}</span>

    </Button>
})

/** The material of a window that is not active: mostly the bar shows through it. */
const resting = { opacity: 0.35 }

interface TaskbarItemProps extends Omit<ButtonActionProps, "children"> {

    active?: boolean

    /** A pinned Program with no window: nothing painted around its icon at rest. */
    closed?: boolean

    // Every system entry has either its Program icon or the system default.
    icon: string

    position: TaskbarPosition

    /** Whether its name shows beside its icon where the Taskbar lies along the screen; on a narrow one it does not. */
    labeled?: boolean

    children?: ReactNode
}
