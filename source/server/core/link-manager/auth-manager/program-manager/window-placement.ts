import { parseRelativeValue, type Position, type Size, type Value } from "@phreshos/core"

/** A standard window as placement reads it: where its corner is, how large it is. */
export type PlacedWindow = Readonly<{ position: Position, size: Size }>

/** Where a window of this size stands centered over another standard window. */
export function overWindow(window: PlacedWindow, size: Size): Position {

    // Its corner, moved by half the asker's size and back by half its own: pixels and shares alike.
    return {
        x: weighted([[window.position.x, 1], [window.size.width, 0.5], [size.width, -0.5]]),
        y: weighted([[window.position.y, 1], [window.size.height, 0.5], [size.height, -0.5]])
    }
}

/** The sum of values, each scaled by its weight, as one value: pixels, a share, or both. */
export function weighted(terms: readonly (readonly [Value, number])[]): Value {

    let share = 0

    let pixels = 0

    for (const [value, weight] of terms) {

        const parsed = parseRelativeValue(value)

        if (!parsed) continue

        share += parsed.relative * weight

        pixels += parsed.pixels * weight
    }

    // Rounded past what a screen can show, so sums of halves leave no float dust; adding zero turns a
    // zero's sign away: -0 is still no distance.
    share = Math.round(share * 1e6) / 1e6 + 0

    pixels = Math.round(pixels * 1e3) / 1e3 + 0

    if (share === 0) return pixels

    if (pixels === 0) return `${share * 100}%`

    return `${share * 100}% ${pixels < 0 ? "-" : "+"} ${Math.abs(pixels)}`
}
