import type { WindowLayer } from "@phreshos/core"

export function windowLayerDefaults(layer: WindowLayer) {
    return Object.freeze({ header: layer === "window" })
}

export function isRawWindowPresentationLayer(layer: WindowLayer) {
    return layer === "under" || layer === "over" || layer === "shell"
}

export function requireRawWindowPresentation(layer: WindowLayer) {
    if (!isRawWindowPresentationLayer(layer)) throw new Error(`The ${layer} layer does not support raw presentation operations`)
}

export function requireWindowMoveGesture(layer: WindowLayer) {
    if (layer !== "window") throw new Error("Move gestures belong to standard Windows")
}

/** Window roles that own one fixed Desktop presentation at a time. */
export type DesktopReplacementLayer = Extract<WindowLayer, "wallpaper">

export function isDesktopReplacementLayer(layer: WindowLayer | undefined): layer is DesktopReplacementLayer {
    return layer === "wallpaper"
}
