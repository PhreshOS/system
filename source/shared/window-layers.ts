import type { WindowLayer, WindowTransaction } from "@phreshos/core"

/** Window facts a Desktop presentation may understand for one layer role. */
export type WindowPresentationProperty =
    | "title"
    | "header"
    | "frame"
    | "position"
    | "size"
    | "minimized"
    | "maximized"
    | "front"
    | "layer"

/**
 * The System's explicit model for how authoritative Windows are presented.
 *
 * A Window retains every authoritative value. These capabilities govern only
 * what the current Desktop presentation can apply, read, or emit.
 */
type WindowLayerPresentation = Readonly<{
    /** Facts this presentation role can report. */
    readable: readonly WindowPresentationProperty[]

    /** Facts this presentation role can apply, follow, mutate, and emit. */
    applicable: readonly WindowPresentationProperty[]
    defaults: Readonly<{
        frame: boolean
        header: boolean
        transaction: WindowTransaction
    }>
    fixed: boolean
    exclusive: boolean
    transactions: boolean
}>

export const windowLayerModel: Readonly<Record<WindowLayer, WindowLayerPresentation>> = Object.freeze({
    window: Object.freeze({
        readable: Object.freeze(["title", "header", "frame", "position", "size", "minimized", "maximized", "front", "layer"] satisfies WindowPresentationProperty[]),
        applicable: Object.freeze(["title", "header", "position", "size", "minimized", "maximized", "front", "layer"] satisfies WindowPresentationProperty[]),
        defaults: Object.freeze({ frame: true, header: true, transaction: false }),
        fixed: false,
        exclusive: false,
        transactions: false
    }),
    under: Object.freeze({
        readable: Object.freeze(["frame", "position", "size", "minimized", "maximized", "front", "layer"] satisfies WindowPresentationProperty[]),
        applicable: Object.freeze(["frame", "position", "size", "minimized", "maximized", "front", "layer"] satisfies WindowPresentationProperty[]),
        defaults: Object.freeze({ frame: false, header: false, transaction: false }),
        fixed: false,
        exclusive: false,
        transactions: true
    }),
    over: Object.freeze({
        readable: Object.freeze(["frame", "position", "size", "minimized", "maximized", "front", "layer"] satisfies WindowPresentationProperty[]),
        applicable: Object.freeze(["frame", "position", "size", "minimized", "maximized", "front", "layer"] satisfies WindowPresentationProperty[]),
        defaults: Object.freeze({ frame: false, header: false, transaction: false }),
        fixed: false,
        exclusive: false,
        transactions: true
    }),
    wallpaper: Object.freeze({
        readable: Object.freeze(["layer"] satisfies WindowPresentationProperty[]),
        applicable: Object.freeze(["layer"] satisfies WindowPresentationProperty[]),
        defaults: Object.freeze({ frame: false, header: false, transaction: false }),
        fixed: true,
        exclusive: true,
        transactions: false
    }),
    "start-menu": Object.freeze({
        readable: Object.freeze(["layer"] satisfies WindowPresentationProperty[]),
        applicable: Object.freeze(["layer"] satisfies WindowPresentationProperty[]),
        defaults: Object.freeze({ frame: false, header: false, transaction: false }),
        fixed: true,
        exclusive: true,
        transactions: false
    })
})

export function windowLayerDefaults(layer: WindowLayer) {
    return windowLayerModel[layer].defaults
}

export function supportsWindowPresentationRead(layer: WindowLayer, property: WindowPresentationProperty) {
    return windowLayerModel[layer].readable.includes(property)
}

export function supportsWindowPresentationApplication(layer: WindowLayer, property: WindowPresentationProperty) {
    return windowLayerModel[layer].applicable.includes(property)
}

export function isWindowPresentationProperty(value: unknown): value is WindowPresentationProperty {
    return presentationProperties.includes(value as WindowPresentationProperty)
}

export function requireWindowPresentationRead(layer: WindowLayer, property: WindowPresentationProperty) {
    if (!supportsWindowPresentationRead(layer, property)) {
        throw new Error(`The ${layer} layer has no ${property} presentation value`)
    }
}

export function requireWindowPresentationApplication(layer: WindowLayer, property: WindowPresentationProperty) {
    if (!supportsWindowPresentationApplication(layer, property)) {
        throw new Error(`The ${layer} layer cannot apply ${property} presentation changes`)
    }
}

export function supportsWindowPresentationTransactions(layer: WindowLayer) {
    return windowLayerModel[layer].transactions
}

/** Window roles that own one fixed Desktop presentation at a time. */
export type DesktopReplacementLayer = Extract<WindowLayer, "wallpaper" | "start-menu">

export function isDesktopReplacementLayer(layer: WindowLayer | undefined): layer is DesktopReplacementLayer {
    return layer !== undefined && windowLayerModel[layer].exclusive
}

export function isFixedWindowPresentationLayer(layer: WindowLayer) {
    return windowLayerModel[layer].fixed
}

export function requireWindowPresentationTransactions(layer: WindowLayer) {
    if (!supportsWindowPresentationTransactions(layer)) {
        throw new Error(`The ${layer} layer does not support explicit presentation transactions`)
    }
}

const presentationProperties = ["title", "header", "frame", "position", "size", "minimized", "maximized", "front", "layer"] as const satisfies readonly WindowPresentationProperty[]
