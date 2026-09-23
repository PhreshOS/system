import type { WindowLayer, WindowTransaction } from "@phreshos/core"

/** Window facts a Desktop presentation may understand for one layer role. */
export type WindowPresentationProperty =
    | "title"
    | "header"
    | "surface"
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

    /** Facts the Desktop can apply from authoritative state and emit. */
    applicable: readonly WindowPresentationProperty[]
    defaults: Readonly<{
        surface: boolean
        header: boolean
        transaction: WindowTransaction
    }>
    fixed: boolean
    transactions: boolean
}>

export const windowLayerModel: Readonly<Record<WindowLayer, WindowLayerPresentation>> = Object.freeze({
    wallpaper: Object.freeze({
        readable: Object.freeze(["layer"] satisfies WindowPresentationProperty[]),
        applicable: Object.freeze(["layer"] satisfies WindowPresentationProperty[]),
        defaults: Object.freeze({ surface: false, header: false, transaction: false }),
        fixed: true,
        transactions: false
    }),
    under: Object.freeze({
        readable: Object.freeze(["surface", "position", "size", "minimized", "maximized", "front", "layer"] satisfies WindowPresentationProperty[]),
        applicable: Object.freeze(["surface", "position", "size", "minimized", "maximized", "front", "layer"] satisfies WindowPresentationProperty[]),
        defaults: Object.freeze({ surface: false, header: false, transaction: false }),
        fixed: false,
        transactions: true
    }),
    window: Object.freeze({
        readable: Object.freeze(["title", "header", "surface", "position", "size", "minimized", "maximized", "front", "layer"] satisfies WindowPresentationProperty[]),
        applicable: Object.freeze(["title", "header", "surface", "position", "size", "minimized", "maximized", "front", "layer"] satisfies WindowPresentationProperty[]),
        // Standard Window motion uses the shared Appearance transaction unless
        // its authoritative Window value explicitly selects another behavior.
        defaults: Object.freeze({ surface: true, header: true, transaction: true }),
        fixed: false,
        transactions: true
    }),
    over: Object.freeze({
        readable: Object.freeze(["surface", "position", "size", "minimized", "maximized", "front", "layer"] satisfies WindowPresentationProperty[]),
        applicable: Object.freeze(["surface", "position", "size", "minimized", "maximized", "front", "layer"] satisfies WindowPresentationProperty[]),
        defaults: Object.freeze({ surface: false, header: false, transaction: false }),
        fixed: false,
        transactions: true
    }),
    shell: Object.freeze({
        readable: Object.freeze(["surface", "position", "size", "minimized", "maximized", "front", "layer"] satisfies WindowPresentationProperty[]),
        applicable: Object.freeze(["surface", "position", "size", "minimized", "maximized", "front", "layer"] satisfies WindowPresentationProperty[]),
        defaults: Object.freeze({ surface: false, header: false, transaction: false }),
        fixed: false,
        transactions: true
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

export function requireWindowPresentationMutation(layer: WindowLayer, property: WindowPresentationProperty) {
    requireWindowPresentationApplication(layer, property)
}

export function supportsWindowPresentationTransactions(layer: WindowLayer) {
    return windowLayerModel[layer].transactions
}

/** Window roles that own one fixed Desktop presentation at a time. */
export type DesktopReplacementLayer = Extract<WindowLayer, "wallpaper">

export function isDesktopReplacementLayer(layer: WindowLayer | undefined): layer is DesktopReplacementLayer {
    return layer === "wallpaper"
}

export function isFixedWindowPresentationLayer(layer: WindowLayer) {
    return windowLayerModel[layer].fixed
}

export function requireWindowPresentationTransactions(layer: WindowLayer) {
    if (!supportsWindowPresentationTransactions(layer)) {
        throw new Error(`The ${layer} layer does not support explicit presentation transactions`)
    }
}

const presentationProperties = ["title", "header", "surface", "position", "size", "minimized", "maximized", "front", "layer"] as const satisfies readonly WindowPresentationProperty[]
