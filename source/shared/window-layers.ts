import type { WindowLayer } from "@phreshos/core"

export function isRawPresentationLayer(layer: WindowLayer) {
    return layer === "under" || layer === "over" || layer === "shell"
}

export function requireRawPresentation(layer: WindowLayer) {
    if (!isRawPresentationLayer(layer)) throw new Error(`The ${layer} layer does not support raw presentation operations`)
}

/** Only drawings in `under` and `over` choose what they are fixed to: standard Windows are on the plane, and the wallpaper and the Shell on the screen. */
export function requireAnchorable(layer: WindowLayer) {
    if (layer !== "under" && layer !== "over") throw new Error(`The ${layer} layer is always fixed to the ${layer === "window" ? "plane" : "viewport"}`)
}

/** A move gesture hands a pointer move to the Desktop in every layer but the wallpaper, which has nowhere to move. */
export function requirePresentationMoveGesture(layer: WindowLayer) {
    if (layer === "wallpaper") throw new Error("The wallpaper has nowhere to move")
}

/** Window roles that own one fixed Desktop presentation at a time. */
export type DesktopReplacementLayer = Extract<WindowLayer, "wallpaper">

export function isDesktopReplacementLayer(layer: WindowLayer | undefined): layer is DesktopReplacementLayer {
    return layer === "wallpaper"
}
