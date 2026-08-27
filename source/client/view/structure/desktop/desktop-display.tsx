import { type ReactNode, type Ref } from "react"
import { desktopDisplayStyle } from "./geometry"

/**
 * The desktop's visible stacking structure. Each program layer owns a
 * containing block; window geometry remains identical inside every layer.
 */
export default function DesktopDisplay({ wallpaper, underWindows, windows, overWindows, windowSurfaceRef, taskbar }: DesktopDisplayProps) {

    return <div className="m-(--desktop-gutter) grid min-h-0 grid-cols-1 grid-rows-[1fr_auto] gap-(--desktop-gutter)" style={desktopDisplayStyle}>

        <div className="absolute inset-0 z-0 overflow-hidden">

            {wallpaper}

        </div>

        <div className="pointer-events-none absolute inset-0 z-1 overflow-hidden">

            {underWindows}

        </div>

        <div ref={windowSurfaceRef} className="pointer-events-none relative z-2">

            {windows}

        </div>

        <div className="pointer-events-none absolute inset-0 z-3 overflow-hidden">

            {overWindows}

        </div>

        {taskbar}

    </div>
}

interface DesktopDisplayProps {

    wallpaper: ReactNode

    underWindows: ReactNode

    windows: ReactNode

    overWindows: ReactNode

    windowSurfaceRef: Ref<HTMLDivElement>

    taskbar: ReactNode
}
