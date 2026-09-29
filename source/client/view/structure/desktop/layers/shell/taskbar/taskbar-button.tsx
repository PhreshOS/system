import { Button, type ButtonActionProps } from "@phreshos/react-ui"
import { type ReactNode } from "react"
import TaskbarTooltip from "./taskbar-tooltip"

/** One visual contract for the Taskbar's fixed system controls. */
export default function TaskbarButton({ icon, label, showLabel = true, ...props }: TaskbarButtonProps) {

    // A control showing its icon alone names itself on hover and focus.
    return <TaskbarTooltip label={label} iconOnly={!showLabel}>

        <Button type="button" size="small" {...props}>

            <span aria-hidden="true" className="size-4 shrink-0">{icon}</span>

            <span className={showLabel ? "hidden text-taskbar-label font-medium sm:inline" : "sr-only"}>{label}</span>

        </Button>

    </TaskbarTooltip>
}

interface TaskbarButtonProps extends Omit<ButtonActionProps, "children"> {

    icon: ReactNode

    label: string

    showLabel?: boolean
}
