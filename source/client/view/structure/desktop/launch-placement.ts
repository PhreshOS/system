import { createContext, useContext } from "react"
import { type Position, type Size } from "@phreshos/core"

/**
 * How this Desktop places what it launches. The Desktop answers from what it shows; the System only
 * records what it is asked.
 */
export interface LaunchPlacement {

    /** Where a new Window should appear, given the size its Program declares, or `null` without one. */
    place(size: Size | null): Position

    /** Moves the view so a Window at this position and size is at its center. */
    reveal(position: Position, size: Size | null): void
}

export const LaunchPlacementContext = createContext<LaunchPlacement>({ place: () => ({ x: 0, y: 0 }), reveal: () => undefined })

export function useLaunchPlacement() {

    return useContext(LaunchPlacementContext)
}
