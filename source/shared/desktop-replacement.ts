import type { WindowLayer } from "@phreshos/core"

/** Window roles that replace one fixed Desktop-owned presentation. */
export type DesktopReplacementLayer = Extract<WindowLayer, "wallpaper" | "start-menu">

export function isDesktopReplacementLayer(layer: WindowLayer | undefined): layer is DesktopReplacementLayer {

    return layer === "wallpaper" || layer === "start-menu"
}
