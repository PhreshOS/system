import { type CSSProperties, type ReactNode } from "react"
import { type AppearanceTaskbar } from "@phreshos/core"
import { type PaintMargins } from "@client/view/components/window-manager/window-geometry"
import { useDesktopScale } from "../desktop-scale"

/**
 * Five coextensive Desktop layers ordered from back to front. No layer owns
 * layout space for another; each receives the complete Desktop bounds.
 */
export default function DesktopLayers({ wallpaper, underWindows, windows, sharedResizeBoundaries, overWindows, shell, spacing }: DesktopLayersProps) {

    // The Desktop's zoom multiplies viewport units too: what sizes itself by the viewport divides by it.
    const scale = useDesktopScale()

    return <div
        data-desktop-layers=""
        className="absolute inset-0 isolate overflow-clip"
        style={{ "--desktop-gutter": `${spacing}px`, "--desktop-scale": scale } as CSSProperties}
    >

        {/* Each layer clips what passes its edges and never scrolls: focus moved to something out of
            view, such as an item of a hidden Taskbar, would otherwise scroll it into view and hold it there. */}

        <div data-desktop-layer="wallpaper" className="absolute inset-0 z-0 overflow-clip">

            {wallpaper}

        </div>

        <div data-desktop-layer="under" className="pointer-events-none absolute inset-0 z-1 overflow-clip">

            {underWindows}

        </div>

        <div data-desktop-layer="window" className="pointer-events-none absolute inset-0 z-2 overflow-clip">

            {/* Standard Windows measure in the whole view, like every other layer; the margins
                around them are painted, not measured. */}
            {windows}

            {sharedResizeBoundaries}

        </div>

        <div data-desktop-layer="over" className="pointer-events-none absolute inset-0 z-3 overflow-clip">

            {overWindows}

        </div>

        <div data-desktop-layer="shell" className="pointer-events-none absolute inset-0 z-4 overflow-clip">

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

    spacing: number

    shell: ReactNode
}

/**
 * The space a standard Window keeps from each edge of the Desktop when it touches it: one spacing,
 * and on the Taskbar's side the Taskbar too, unless it overlays the Desktop.
 */
export function desktopMargins(spacing: number, taskbar: AppearanceTaskbar): PaintMargins {
    const inset = {
        top: spacing,
        right: spacing,
        bottom: spacing,
        left: spacing
    }

    if (!taskbar.overlay) inset[taskbar.position] += taskbar.size + spacing

    return inset
}
