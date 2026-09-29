import type { WindowLayer } from "@phreshos/core"

export function isRawWindowPresentationLayer(layer: WindowLayer) {
    return layer === "under" || layer === "over" || layer === "shell"
}

export function requireRawWindowPresentation(layer: WindowLayer) {
    if (!isRawWindowPresentationLayer(layer)) throw new Error(`The ${layer} layer does not support raw presentation operations`)
}

/** A move gesture hands a pointer move to the Desktop in every layer but the wallpaper, which has nowhere to move. */
export function requireWindowMoveGesture(layer: WindowLayer) {
    if (layer === "wallpaper") throw new Error("The wallpaper has nowhere to move")
}

/** Window roles that own one fixed Desktop presentation at a time. */
export type DesktopReplacementLayer = Extract<WindowLayer, "wallpaper">

export function isDesktopReplacementLayer(layer: WindowLayer | undefined): layer is DesktopReplacementLayer {
    return layer === "wallpaper"
}
