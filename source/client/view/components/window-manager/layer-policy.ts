import type { WindowPresentationState } from "../desktop-host/window-presentation"
import { requireWindowPresentationApplication, supportsWindowPresentationApplication, type WindowPresentationProperty } from "@shared/window-layers"

export const requirePresentationApplication = requireWindowPresentationApplication

/** A target contributes only properties allowed by the receiving role. */
export function followedState(current: WindowPresentationState, target: WindowPresentationState, previous?: WindowPresentationState) {
    const changes: Partial<WindowPresentationState> = {}
    for (const property of followedProperties) {
        if (!supportsWindowPresentationApplication(current.layer, property)) continue
        if (!previous || JSON.stringify(previous[property]) !== JSON.stringify(target[property])) {
            Object.assign(changes, { [property]: target[property] })
        }
    }
    return changes
}

const followedProperties = ["title", "header", "frame", "position", "size", "minimized", "maximized"] as const satisfies readonly WindowPresentationProperty[]
