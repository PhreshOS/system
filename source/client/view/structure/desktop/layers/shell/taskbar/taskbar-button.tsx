import { Button, type ButtonProps } from "@phreshos/react-ui"
import { type ReactNode } from "react"

/** One visual contract for the Taskbar's fixed system controls. */
export default function TaskbarButton({ icon, label, showLabel = true, ...props }: TaskbarButtonProps) {

    return <Button type="button" size="small" {...props}>

        <span aria-hidden="true" className="size-4 shrink-0">{icon}</span>

        <span className={showLabel ? "hidden text-taskbar-label font-medium sm:inline" : "sr-only"}>{label}</span>

    </Button>
}

interface TaskbarButtonProps extends Omit<ButtonProps, "children"> {

    icon: ReactNode

    label: string

    showLabel?: boolean
}
