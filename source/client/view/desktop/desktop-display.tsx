import { type ReactNode, type Ref } from "react"
import { desktopDisplayStyle } from "./geometry"

/**
 * The desktop's visible stacking structure. Each program layer owns a
 * containing block; window geometry remains identical inside every layer.
 */
export default function DesktopDisplay({ wallpaper, underWindows, windows, overWindows, windowSurfaceRef, taskbar }: DesktopDisplayProps) {

    return <main aria-label="Desktop display" className="grid min-h-0 grid-cols-1 grid-rows-[1fr_auto]" style={desktopDisplayStyle}>

        <section aria-label="Desktop wallpaper" className="absolute inset-0 z-0 overflow-hidden">

            {wallpaper}

        </section>

        <section aria-label="Under windows" className="pointer-events-none absolute inset-0 z-1 overflow-hidden">

            {underWindows}

        </section>

        <section ref={windowSurfaceRef} aria-label="Windows" className="pointer-events-none relative z-2">

            {windows}

        </section>

        <section aria-label="Over windows" className="pointer-events-none absolute inset-0 z-3 overflow-hidden">

            {overWindows}

        </section>

        {taskbar}

    </main>
}

interface DesktopDisplayProps {

    wallpaper: ReactNode

    underWindows: ReactNode

    windows: ReactNode

    overWindows: ReactNode

    windowSurfaceRef: Ref<HTMLElement>

    taskbar: ReactNode
}
