import { ComponentProps, ReactNode } from "react"

/** One action in a launcher, without knowing what it launches. */
export default function ({ icon, label, description, children, className, ...props }: LauncherItemProps) {

    return <button

        {...props}

        type="button"

        className={`group grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-xl px-3 py-2 text-left outline-none hover:bg-white/45 focus-visible:bg-white/55 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/85 active:bg-white/65 ${className ?? ""}`}

    >

        <span className="grid size-9 place-items-center overflow-hidden rounded-xl border border-white/55 bg-white/25 text-base font-semibold text-slate-700 shadow-launcher-icon">

            <img src={icon} alt="" draggable={false} className="size-full object-contain p-1" />

        </span>

        <span className="min-w-0">

            <span className="block truncate text-sm font-medium">{children}</span>

            {description && <span className="block truncate text-xs text-slate-600/80">{description}</span>}

        </span>

    </button>
}

export interface LauncherItemProps extends ComponentProps<"button"> {

    icon: string

    label: string

    description?: string | null

    children: ReactNode
}
