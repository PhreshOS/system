import { useReducedMotion } from "@libs/react-motion"
import { ComponentProps } from "react"

/** A compact taskbar control whose contents define its meaning. */
export default function TaskbarButton({ small = false, className, ...props }: TaskbarButtonProps) {

    const reducedMotion = useReducedMotion()

    return <button

        type="button"

        className={`grid shrink-0 cursor-pointer select-none grid-flow-col auto-cols-max place-items-center rounded-lg border border-white/45 bg-white/30 shadow-taskbar-control outline-none hover:bg-white/50 focus-visible:ring-2 focus-visible:ring-white/85 ${small ? "h-7 gap-1 px-2 text-xs" : "h-8 gap-1.5 px-2"} ${reducedMotion ? "" : "transition-colors duration-100 active:scale-95"} ${className ?? ""}`}

        {...props}

    />
}

interface TaskbarButtonProps extends ComponentProps<"button"> {

    small?: boolean
}
