import type { WindowPresentationState } from "../desktop-host/window-presentation"
import { requireWindowPresentationMutation, supportsWindowPresentationApplication, type WindowPresentationProperty } from "@shared/window-layers"

export const requirePresentationMutation = requireWindowPresentationMutation

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

const followedProperties = ["title", "header", "surface", "position", "size", "minimized", "maximized"] as const satisfies readonly WindowPresentationProperty[]
