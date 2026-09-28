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

/** How far this Desktop's view is moved across the plane, in pixels or in whole views as the context says. */
export interface ViewportOffset {

    x: number

    y: number
}

/**
 * Moves a position by views: one view is one share of the surface, so `-1/2` moved by one view is `50%`,
 * and `120` moved by one view is `100% + 120`. Views stay shares, so each Desktop resolves them against
 * its own size and a Window stays in its view on every screen.
 */
export function shiftPosition(position: Position, views: ViewportOffset): Position {

    if (views.x === 0 && views.y === 0) return position

    return { x: shiftValue(position.x, views.x), y: shiftValue(position.y, views.y) }
}

/** The whole view a Window's center is in, counted from the plane's center. */
export function viewOfGeometry(position: Position, size: Size, surface: WindowSurfaceSize): ViewportOffset {

    if (!surface.width || !surface.height) return { x: 0, y: 0 }

    const region = resolveWindowGeometry(position, size, surface)

    return {
        x: Math.round((region.x + region.width / 2 - surface.width / 2) / surface.width),
        y: Math.round((region.y + region.height / 2 - surface.height / 2) / surface.height)
    }
}

/** A point of the plane in pixels, recorded as the view it is in plus pixels within that view, so it keeps to its view on every Desktop. */
export function recordedPosition(point: { x: number, y: number }, surface: WindowSurfaceSize): Position {

    const views = { x: surface.width ? Math.round(point.x / surface.width) : 0, y: surface.height ? Math.round(point.y / surface.height) : 0 }

    return shiftPosition({ x: Math.round(point.x - views.x * surface.width), y: Math.round(point.y - views.y * surface.height) }, views)
}

function shiftValue(value: Value, views: number): Value {

    if (views === 0) return value

    const { relative: share, pixels } = relative(value)

    // Rounded, so repeated moves do not gather floating-point noise.
    const percent = Math.round((share + views) * 100 * 10000) / 10000

    if (percent === 0) return pixels

    if (pixels === 0) return `${percent}%`

    return `${percent}% ${pixels < 0 ? "-" : "+"} ${Math.abs(pixels)}`
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

/** Space kept on each side of the Desktop when painting what touches it. */
export interface PaintMargins {

    top: number

    right: number

    bottom: number

    left: number
}

export const noPaintMargins: PaintMargins = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 })

/**
 * The window's box is its geometry; what is painted of it is drawn inside. An
 * edge between two Windows is drawn `inset` inside, so neighbors keep a gap
 * between them; an edge on the Desktop's own edge is drawn that side's margin
 * inside, clear of the screen's edge and the Taskbar. Gaps and margins are
 * paint, never geometry. Snap previews use this same function, so preview and
 * final paint cannot disagree.
 */
export function windowPaintInsets(position: Position, size: Size, surface: WindowSurfaceSize, inset: number, margins: PaintMargins, current?: WindowRegion) {

    const x = current?.x ?? surface.width / 2 + pixels(position.x, surface.width)

    const y = current?.y ?? surface.height / 2 + pixels(position.y, surface.height)

    const width = current?.width ?? pixels(size.width, surface.width)

    const height = current?.height ?? pixels(size.height, surface.height)

    return {

        top: startsAtBoundary(position.y, y, surface.height) ? margins.top : inset,

        right: endsAtBoundary(position.x, size.width, x, width, surface.width) ? margins.right : inset,

        bottom: endsAtBoundary(position.y, size.height, y, height, surface.height) ? margins.bottom : inset,

        left: startsAtBoundary(position.x, x, surface.width) ? margins.left : inset
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
