import { ComponentProps } from "react"
import { useReducedMotion } from "@libs/react-motion"

/**
 * A pressable item with a raised state. What "raised" means is the caller's.
 */
export default function ({ active = false, icon, children, className, ...props }: TaskbarItemProps) {

    const reducedMotion = useReducedMotion()

    const surface = active

        ? "border-white/75 bg-gradient-to-b from-white/70 to-white/40 text-slate-900 shadow-taskbar-item-active"

        : "border-white/35 bg-white/20 text-slate-800 shadow-taskbar-item hover:border-white/55 hover:bg-white/40"

    return <button

        aria-pressed={active}

        className={`relative flex h-8 max-w-40 shrink-0 scroll-mx-8 cursor-pointer select-none items-center gap-1.5 overflow-hidden rounded-lg border px-2.5 text-xs font-medium text-shadow-chrome outline-none focus-visible:ring-2 focus-visible:ring-white/80 ${reducedMotion ? "" : "transition-colors duration-100 active:scale-95"} ${surface} ${className ?? ""}`}

        {...props}

    >

        <img src={icon} alt="" draggable={false} className="size-4 shrink-0 rounded-sm object-contain" />

        <span className="truncate">{children}</span>

        {active && <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-sky-500 shadow-taskbar-indicator" />}

    </button>
}

export interface TaskbarItemProps extends ComponentProps<"button"> {

    active?: boolean

    // Every system entry has either its Program icon or the system default.
    icon: string
}
