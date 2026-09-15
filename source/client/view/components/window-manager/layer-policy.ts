import type { WindowLayer } from "@phreshos/core"
import type { LocalWindowState } from "../desktop-host/local-window"

type PresentationProperty = "title" | "position" | "size" | "minimized" | "maximized" | "depth" | "surface"

/** Properties owned by Desktop for each local Window role. */
const properties: Readonly<Record<WindowLayer, readonly PresentationProperty[]>> = {
    window: ["title", "position", "size", "minimized", "maximized", "depth"],
    under: ["position", "size", "minimized", "maximized", "depth", "surface"],
    over: ["position", "size", "minimized", "maximized", "depth", "surface"],
    wallpaper: [],
    "start-menu": []
}

export function requireLocalProperty(layer: WindowLayer, property: PresentationProperty) {
    if (!properties[layer].includes(property)) {
        throw new Error(`The ${layer} layer does not allow local ${property} changes`)
    }
}

/** A target contributes only properties allowed by the receiving role. */
export function followedState(current: LocalWindowState, target: LocalWindowState, previous?: LocalWindowState) {
    const changes: Partial<LocalWindowState> = {}
    for (const property of properties[current.layer]) {
        if (property === "surface") continue
        if (!previous || JSON.stringify(previous[property]) !== JSON.stringify(target[property])) {
            Object.assign(changes, { [property]: target[property] })
        }
    }
    return changes
}
