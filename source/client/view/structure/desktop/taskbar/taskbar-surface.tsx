import { ReactNode } from "react"
import { Surface, useTheme } from "@phreshos/react-ui"
import { numericScale } from "@phreshos/core"

/** The window-material shell shared by surfaces opened from the taskbar. */
export const taskbarSurfaceClassName = "m-0 isolate overflow-hidden border-0 bg-transparent p-0 shadow-window-active outline-none"

export default function TaskbarSurface({ label, labelId, children }: TaskbarSurfaceProps) {

    const contentRadius = numericScale(useTheme().radius).medium

    return <Surface className="grid min-h-0 max-h-[inherit] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[inherit]">

        <h2 id={labelId} className="relative grid h-10 items-center px-3.5 text-window-title font-medium select-none">{label}</h2>

        <div style={{ borderRadius: contentRadius }} className="relative m-1.5 mt-0 min-h-0 overflow-hidden bg-white/25 shadow-window-content">

            {children}

        </div>

    </Surface>
}

interface TaskbarSurfaceProps {

    label: string

    labelId: string

    children: ReactNode
}
