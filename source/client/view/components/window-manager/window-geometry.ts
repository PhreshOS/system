import { parseRelativeValue, type Position, type RelativeValue, type Size, type Value } from "@phreshos/core"

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

export const minimumWindowSize = Object.freeze({ width: 260, height: 160 })

/** The size the Desktop shows a standard Window at, in each dimension the System records as zero. */
export const presentedWindowSize = Object.freeze({ width: 520, height: 340 })

const shownSizes = new WeakMap<Size, Size>()

/**
 * A zero dimension is no size at all: the System records zero when nobody chose one. The Desktop shows its
 * own size there instead, and records nothing until the Window is resized.
 */
export function shownSize(size: Size): Size {

    const width = isZero(size.width) ? presentedWindowSize.width : size.width

    const height = isZero(size.height) ? presentedWindowSize.height : size.height

    if (width === size.width && height === size.height) return size

    const cached = shownSizes.get(size)

    if (cached) return cached

    const shown = { width, height }

    shownSizes.set(size, shown)

    return shown
}

function isZero(value: Value) {

    const { relative: share, pixels } = relative(value)

    return share === 0 && pixels === 0
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

/**
 * Resolves one declarative Window geometry inside a measured surface. A
 * position is the Window's top-left corner on a plane whose zero is the center
 * of the surface its layer provides; the region it returns is measured from
 * the surface's top-left corner, where the Desktop paints it.
 */
export function resolveWindowGeometry(position: Position, size: Size, surface: WindowSurfaceSize): WindowRegion {

    return {
        x: surface.width / 2 + pixels(position.x, surface.width),
        y: surface.height / 2 + pixels(position.y, surface.height),
        width: pixels(size.width, surface.width),
        height: pixels(size.height, surface.height)
    }
}

/** How many whole views the plane of standard Windows reaches from its center, in each direction. */
export const planeReach = 2

/** The largest a standard Window is shown, in views, in each dimension. */
export const largestWindowViews = 2

const boundedGeometries = new WeakMap<Position, { size: Size, surface: WindowSurfaceSize, bounded: { position: Position, size: Size } }>()

/**
 * The Desktop shows standard Windows only on its plane, which reaches two views from the center in each
 * direction, and no larger than two views in each dimension. A Window recorded beyond the plane is shown
 * at its edge, and one recorded larger is shown at that size; what the System records stays as it is,
 * until the Window is moved or resized here.
 */
export function boundedGeometry(position: Position, size: Size, surface: WindowSurfaceSize): { position: Position, size: Size } {

    if (!surface.width || !surface.height) return { position, size }

    const cached = boundedGeometries.get(position)

    if (cached && cached.size === size && cached.surface.width === surface.width && cached.surface.height === surface.height) return cached.bounded

    const width = pixels(size.width, surface.width)

    const height = pixels(size.height, surface.height)

    const shownWidth = Math.min(width, surface.width * largestWindowViews)

    const shownHeight = Math.min(height, surface.height * largestWindowViews)

    const x = pixels(position.x, surface.width)

    const y = pixels(position.y, surface.height)

    const edge = { x: surface.width * (planeReach + 0.5), y: surface.height * (planeReach + 0.5) }

    const shownX = Math.min(Math.max(x, -edge.x), edge.x - shownWidth)

    const shownY = Math.min(Math.max(y, -edge.y), edge.y - shownHeight)

    const bounded = {
        position: shownX === x && shownY === y ? position : { x: Math.round(shownX), y: Math.round(shownY) },
        size: shownWidth === width && shownHeight === height ? size : { width: Math.round(shownWidth), height: Math.round(shownHeight) }
    }

    boundedGeometries.set(position, { size, surface: { ...surface }, bounded })

    return bounded
}

/** How far this Desktop's view is moved across the plane. Positions it shows are the plane's minus it. */
export interface ViewportOffset {

    x: number

    y: number
}

/** Moves a position by pixels, keeping any share of the surface it names: `"-1/2"` moved by 100 is `"-50% + 100"`. */
export function shiftPosition(position: Position, by: ViewportOffset): Position {

    if (by.x === 0 && by.y === 0) return position

    return { x: shiftValue(position.x, by.x), y: shiftValue(position.y, by.y) }
}

function shiftValue(value: Value, by: number): Value {

    if (by === 0) return value

    const { relative: share, pixels } = relative(value)

    const moved = pixels + by

    if (share === 0) return moved

    return `${share * 100}% ${moved < 0 ? "-" : "+"} ${Math.abs(moved)}`
}

/** The inverse at the other end: a painted region's position on the plane, whose zero is the surface's center. */
export function planeGeometry(region: WindowRegion, surface: WindowSurfaceSize): WindowRegion {

    return { ...region, x: region.x - surface.width / 2, y: region.y - surface.height / 2 }
}

/**
 * Applies a presentation-owned minimum without rewriting authoritative values.
 * A smaller workspace is the only case where the Desktop cannot provide it.
 */
export function constrainWindowGeometry(region: WindowRegion, surface: WindowSurfaceSize, minimum: WindowSurfaceSize): WindowRegion {

    return {
        ...region,
        width: Math.max(region.width, Math.min(minimum.width, surface.width)),
        height: Math.max(region.height, Math.min(minimum.height, surface.height))
    }
}

/**
 * The window's box is its geometry; an ordinary painted surface is inset only
 * on edges that do not touch that box's containing surface. Snap previews use
 * this same function, so preview and final paint cannot disagree.
 */
export function windowPaintInsets(position: Position, size: Size, surface: WindowSurfaceSize, inset: number, current?: WindowRegion) {

    const x = current?.x ?? surface.width / 2 + pixels(position.x, surface.width)

    const y = current?.y ?? surface.height / 2 + pixels(position.y, surface.height)

    const width = current?.width ?? pixels(size.width, surface.width)

    const height = current?.height ?? pixels(size.height, surface.height)

    return {

        top: startsAtBoundary(position.y, y, surface.height) ? 0 : inset,

        right: endsAtBoundary(position.x, size.width, x, width, surface.width) ? 0 : inset,

        bottom: endsAtBoundary(position.y, size.height, y, height, surface.height) ? 0 : inset,

        left: startsAtBoundary(position.x, x, surface.width) ? 0 : inset
    }
}

function pixels(value: Value, span: number) {

    const resolved = relative(value)

    return resolved.relative * span + resolved.pixels
}

function startsAtBoundary(value: Value, resolved: number, span: number) {

    if (span) return closeTo(resolved, 0)

    // Without a measured span, the surface's first edge is half of it before the center.
    return equal(value, -0.5, 0)
}

function endsAtBoundary(position: Value, size: Value, resolvedPosition: number, resolvedSize: number, span: number) {

    if (span) return closeTo(resolvedPosition + resolvedSize, span)

    const first = relative(position)

    const second = relative(size)

    return same(first.relative + second.relative, 0.5) && closeTo(first.pixels + second.pixels, 0)
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
