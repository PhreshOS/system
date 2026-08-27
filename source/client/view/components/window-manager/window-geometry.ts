import { parseRelativeValue, type Position, type RelativeValue, type Size, type Value } from "@phreshos/core"
import { windowPaintInset } from "../../desktop/geometry"

export interface WindowRegion {

    x: number

    y: number

    width: number

    height: number
}

export interface WindowSurfaceSize {

    width: number

    height: number
}

/**
 * Every window type uses this same calculation inside the CSS containing
 * block supplied by its layer. Every expression is one relative coefficient
 * plus one pixel offset. No layer, boundary correction, gutter, or clamping
 * participates here.
 */
export function resolveWindowValue(value: Value) {

    const resolved = relative(value)

    if (resolved.relative === 0) return `${resolved.pixels}px`

    if (resolved.pixels === 0) return `calc(${resolved.relative * 100}%)`

    const operator = resolved.pixels < 0 ? "-" : "+"

    return `calc(${resolved.relative * 100}% ${operator} ${Math.abs(resolved.pixels)}px)`
}

/** Returns whether every geometry value is independent of its containing block. */
export function absoluteWindowGeometry(position: Position, size: Size) {

    return [position.x, position.y, size.width, size.height].every(value => relative(value).relative === 0)
}

/** Returns whether the geometry exactly fills its containing block. */
export function wholeWindowGeometry(position: Position, size: Size) {

    return equal(position.x, 0, 0) && equal(position.y, 0, 0) && equal(size.width, 1, 0) && equal(size.height, 1, 0)
}

/** Resolves one declarative Window geometry inside a measured surface. */
export function resolveWindowGeometry(position: Position, size: Size, surface: WindowSurfaceSize): WindowRegion {

    return {
        x: pixels(position.x, surface.width),
        y: pixels(position.y, surface.height),
        width: pixels(size.width, surface.width),
        height: pixels(size.height, surface.height)
    }
}

/**
 * The window's box is its geometry; an ordinary painted frame is inset only
 * on edges that do not touch that box's containing surface. Snap previews use
 * this same function, so preview and final paint cannot disagree.
 */
export function windowPaintInsets(position: Position, size: Size, surface: WindowSurfaceSize, current?: WindowRegion) {

    const x = current?.x ?? pixels(position.x, surface.width)

    const y = current?.y ?? pixels(position.y, surface.height)

    const width = current?.width ?? pixels(size.width, surface.width)

    const height = current?.height ?? pixels(size.height, surface.height)

    return {

        top: startsAtBoundary(position.y, y, surface.height) ? 0 : windowPaintInset,

        right: endsAtBoundary(position.x, size.width, x, width, surface.width) ? 0 : windowPaintInset,

        bottom: endsAtBoundary(position.y, size.height, y, height, surface.height) ? 0 : windowPaintInset,

        left: startsAtBoundary(position.x, x, surface.width) ? 0 : windowPaintInset
    }
}

function pixels(value: Value, span: number) {

    const resolved = relative(value)

    return resolved.relative * span + resolved.pixels
}

function startsAtBoundary(value: Value, resolved: number, span: number) {

    if (span) return closeTo(resolved, 0)

    return equal(value, 0, 0)
}

function endsAtBoundary(position: Value, size: Value, resolvedPosition: number, resolvedSize: number, span: number) {

    if (span) return closeTo(resolvedPosition + resolvedSize, span)

    const first = relative(position)

    const second = relative(size)

    return same(first.relative + second.relative, 1) && closeTo(first.pixels + second.pixels, 0)
}

function closeTo(value: number, boundary: number) {

    return Math.abs(value - boundary) <= 0.5
}

function equal(value: Value, expectedRelative: number, expectedPixels: number) {

    const resolved = relative(value)

    return same(resolved.relative, expectedRelative) && same(resolved.pixels, expectedPixels)
}

function same(value: number, expected: number) {

    return Math.abs(value - expected) <= 1e-9
}

function relative(value: Value): RelativeValue {

    const parsed = parseRelativeValue(value)

    if (!parsed) throw new Error("A Window received invalid geometry")

    return parsed
}
