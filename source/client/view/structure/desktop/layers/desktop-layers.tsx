import { type CSSProperties, type ReactNode, type Ref } from "react"
import { type AppearanceTaskbar } from "@phreshos/core"

/**
 * Five coextensive Desktop layers ordered from back to front. No layer owns
 * layout space for another; each receives the complete Desktop bounds.
 */
export default function DesktopLayers({ wallpaper, underWindows, windows, sharedResizeBoundaries, overWindows, shell, windowSurfaceRef, spacing, taskbar }: DesktopLayersProps) {

    return <div
        data-desktop-layers=""
        className="absolute inset-0 isolate overflow-hidden"
        style={{ "--desktop-gutter": `${spacing}px` } as CSSProperties}
    >

        <div data-desktop-layer="wallpaper" className="absolute inset-0 z-0 overflow-hidden">

            {wallpaper}

        </div>

        <div data-desktop-layer="under" className="pointer-events-none absolute inset-0 z-1 overflow-hidden">

            {underWindows}

        </div>

        <div data-desktop-layer="window" className="pointer-events-none absolute inset-0 z-2 overflow-hidden">

            {/* This surface defines standard-window geometry, not a paint
                boundary. Windows may leave it and are clipped only by the
                complete Desktop layer. */}
            <div ref={windowSurfaceRef} data-window-surface="" className="absolute" style={windowSurfaceInsets(spacing, taskbar)}>

                {windows}

                {sharedResizeBoundaries}

            </div>

        </div>

        <div data-desktop-layer="over" className="pointer-events-none absolute inset-0 z-3 overflow-hidden">

            {overWindows}

        </div>

        <div data-desktop-layer="shell" className="pointer-events-none absolute inset-0 z-4 overflow-hidden">

            {shell}

        </div>

    </div>
}

interface DesktopLayersProps {

    wallpaper: ReactNode

    underWindows: ReactNode

    windows: ReactNode

    sharedResizeBoundaries: ReactNode

    overWindows: ReactNode

    windowSurfaceRef: Ref<HTMLDivElement>

    spacing: number

    taskbar: AppearanceTaskbar

    shell: ReactNode
}

/** Keeps one Appearance gap outside the Taskbar and another before windows. */
export function windowSurfaceInsets(spacing: number, taskbar: AppearanceTaskbar): CSSProperties {
    const inset = {
        top: spacing,
        right: spacing,
        bottom: spacing,
        left: spacing
    }

    inset[taskbar.position] += taskbar.size + spacing

    return inset
}
