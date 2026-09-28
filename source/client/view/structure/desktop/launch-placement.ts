import { createContext, useContext } from "react"
import { type Position, type Size } from "@phreshos/core"

/**
 * How this Desktop places what it launches. The Desktop answers from what it shows; the System only
 * records what it is asked.
 */
export interface LaunchPlacement {

    /**
     * Where a new Window should appear, given the size its Program declares; without one, the size it
     * should have as well.
     */
    place(size: Size | null): Readonly<{ position: Position, size?: Size }>

    /** Moves the view to the whole view a Window at this position and size is in. */
    reveal(position: Position, size: Size | null): void
}

export const LaunchPlacementContext = createContext<LaunchPlacement>({ place: () => ({ position: { x: 0, y: 0 } }), reveal: () => undefined })

export function useLaunchPlacement() {

    return useContext(LaunchPlacementContext)
}
