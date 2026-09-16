import { ComponentProps, ReactNode } from "react"

/** One action in the Programs half of the launcher. */
export default function ({ icon, label, description, children, className, ...props }: LauncherItemProps) {

    return <button

        {...props}

        type="button"

        className={`grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-xl px-3 py-2 text-start outline-none active:scale-[0.98] ${className ?? ""}`}

    >

        <img src={icon} alt="" draggable={false} className="size-9 object-contain p-1" />

        <span className="min-w-0">

            <span className="block truncate text-sm font-medium">{children}</span>

            {description && <span className="block max-w-[90%] truncate text-xs opacity-60">{description}</span>}

        </span>

    </button>
}

export interface LauncherItemProps extends ComponentProps<"button"> {

    icon: string

    label: string

    description?: string | null

    children: ReactNode
}
