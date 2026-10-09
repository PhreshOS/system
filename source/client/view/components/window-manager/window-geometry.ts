import { parseRelativeValue, type Position, type RelativeValue, type Size, type Value } from "@phreshos/core"

export interface WindowRegion {

    x: number

    y: number

    width: number

    height: number
}

export interface ViewSize {

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
export function resolveWindowGeometry(position: Position, size: Size, surface: ViewSize): WindowRegion {

    return {
        x: surface.width / 2 + pixels(position.x, surface.width),
        y: surface.height / 2 + pixels(position.y, surface.height),
        width: pixels(size.width, surface.width),
        height: pixels(size.height, surface.height)
    }
}

/** How many whole views the plane of standard Windows reaches from its center, in each direction. */
export const planeReach = 2

/** The plane of standard Windows: as many views across and down as the view reaches on both sides, and its own. */
export function planeSize(desktop: Readonly<{ width: number, height: number }>) {
    const views = planeReach * 2 + 1
    return { width: desktop.width * views, height: desktop.height * views }
}

/** The largest a standard Window is shown, in views, in each dimension. */
export const largestWindowViews = 2

const boundedGeometries = new WeakMap<Position, { size: Size, surface: ViewSize, bounded: { position: Position, size: Size } }>()

/**
 * The Desktop shows standard Windows only on its plane, which reaches two views from the center in each
 * direction, and no larger than two views in each dimension. A Window recorded beyond the plane is shown
 * at its edge, and one recorded larger is shown at that size; what the System records stays as it is,
 * until the Window is moved or resized here.
 */
export function boundedGeometry(position: Position, size: Size, surface: ViewSize): { position: Position, size: Size } {

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

/** How far this Desktop's view is moved across the plane: in pixels, or in views, as the name holding it says. */
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
export function viewOfGeometry(position: Position, size: Size, surface: ViewSize): ViewportOffset {

    if (!surface.width || !surface.height) return { x: 0, y: 0 }

    const region = resolveWindowGeometry(position, size, surface)

    return {
        x: Math.round((region.x + region.width / 2 - surface.width / 2) / surface.width),
        y: Math.round((region.y + region.height / 2 - surface.height / 2) / surface.height)
    }
}

/** A point of the plane in pixels, recorded as the view it is in plus pixels within that view, so it keeps to its view on every Desktop. */
export function recordedPosition(point: { x: number, y: number }, surface: ViewSize): Position {

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
export function planeGeometry(region: WindowRegion, surface: ViewSize): WindowRegion {

    return { ...region, x: region.x - surface.width / 2, y: region.y - surface.height / 2 }
}

/**
 * Applies a presentation-owned minimum without rewriting authoritative values.
 * A smaller workspace is the only case where the Desktop cannot provide it.
 */
export function constrainWindowGeometry(region: WindowRegion, surface: ViewSize, minimum: ViewSize): WindowRegion {

    return {
        ...region,
        width: Math.max(region.width, Math.min(minimum.width, surface.width)),
        height: Math.max(region.height, Math.min(minimum.height, surface.height))
    }
}

/**
 * Where a standard Window goes when it is held against edges of the view: a half, or a quarter at a
 * corner, of the room the view leaves for Windows. That room is the view less the margins painted at
 * its edges, which are larger on the Taskbar's side, so the line between two halves is at the room's
 * middle, not the view's: the view's middle moved by half the difference of the margins. It is written
 * as a share of the view and pixels, so every Desktop resolves it in its own size.
 *
 * `direction` is -1 toward the start (left, top), 1 toward the end, or 0 for the whole room, per axis.
 */
export function snapPlacement(direction: Readonly<{ x: number, y: number }>, margins: PaintMargins): { position: Position, size: Size } {

    const across = snapSpan(direction.x, margins.left, margins.right)

    const down = snapSpan(direction.y, margins.top, margins.bottom)

    return { position: { x: across.position, y: down.position }, size: { width: across.size, height: down.size } }
}

function snapSpan(direction: number, start: number, end: number): { position: Value, size: Value } {

    if (!direction) return { position: "-1/2", size: "1/1" }

    // Where the middle of the room is, in pixels from the view's middle.
    const middle = Math.round((start - end) / 2)

    return direction < 0
        ? { position: "-1/2", size: shareAndPixels(0.5, middle) }
        : { position: shareAndPixels(0, middle), size: shareAndPixels(0.5, -middle) }
}

/** A share of the view and pixels, in the form a Window's values take. */
function shareAndPixels(share: number, pixels: number): Value {

    if (share === 0) return pixels

    if (pixels === 0) return `${share * 100}%`

    return `${share * 100}% ${pixels < 0 ? "-" : "+"} ${Math.abs(pixels)}`
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
 * The space painted around a standard Window: the margins where it meets an edge of its view, the
 * inset elsewhere. The edges are those of the view the Window lives in on the plane, which is
 * `shift` pixels away from what is shown when the Desktop looks between two views; so a Window keeps
 * its margins wherever the view looks from.
 */
export function windowPaintInsets(position: Position, size: Size, surface: ViewSize, inset: number, margins: PaintMargins, current?: WindowRegion, shift: Readonly<{ x: number, y: number }> = noShift) {

    return contactInsets(windowEdgeContacts(position, size, surface, current, shift), inset, margins)
}

/** Which sides of a standard Window meet an edge of its view. */
export type WindowSides = Readonly<{ top: boolean, right: boolean, bottom: boolean, left: boolean }>

export const noWindowSides: WindowSides = Object.freeze({ top: false, right: false, bottom: false, left: false })

export const allWindowSides: WindowSides = Object.freeze({ top: true, right: true, bottom: true, left: true })

/** The sides of a Window that meet an edge of the view it lives in; see `windowPaintInsets`. */
export function windowEdgeContacts(position: Position, size: Size, surface: ViewSize, current?: WindowRegion, shift: Readonly<{ x: number, y: number }> = noShift): WindowSides {

    const x = current?.x ?? surface.width / 2 + pixels(position.x, surface.width)

    const y = current?.y ?? surface.height / 2 + pixels(position.y, surface.height)

    const width = current?.width ?? pixels(size.width, surface.width)

    const height = current?.height ?? pixels(size.height, surface.height)

    return {

        top: startsAtBoundary(position.y, y + shift.y, surface.height),

        right: endsAtBoundary(position.x, size.width, x + shift.x, width, surface.width),

        bottom: endsAtBoundary(position.y, size.height, y + shift.y, height, surface.height),

        left: startsAtBoundary(position.x, x + shift.x, surface.width)
    }
}

/** The margins on the sides that meet an edge, the inset on the others. */
export function contactInsets(contacts: WindowSides, inset: number, margins: PaintMargins): PaintMargins {

    return {
        top: contacts.top ? margins.top : inset,
        right: contacts.right ? margins.right : inset,
        bottom: contacts.bottom ? margins.bottom : inset,
        left: contacts.left ? margins.left : inset
    }
}

/**
 * The box that keeps a Window's painted surface where it is while the `carried` sides let go of the
 * edges they meet: each such side moves in by what its margin kept beyond the inset. A hand carrying
 * a side takes it off the edge, and what a person sees of the Window must not jump when it does.
 */
export function letGoOfEdges(region: WindowRegion, contacts: WindowSides, carried: WindowSides, inset: number, margins: PaintMargins): WindowRegion {

    const top = carried.top && contacts.top ? margins.top - inset : 0

    const right = carried.right && contacts.right ? margins.right - inset : 0

    const bottom = carried.bottom && contacts.bottom ? margins.bottom - inset : 0

    const left = carried.left && contacts.left ? margins.left - inset : 0

    return { x: region.x + left, y: region.y + top, width: region.width - left - right, height: region.height - top - bottom }
}

function pixels(value: Value, span: number) {

    const resolved = relative(value)

    return resolved.relative * span + resolved.pixels
}

const noShift = Object.freeze({ x: 0, y: 0 })

/** Whether a point lies on a line of the grid of views, which repeats every span. */
function onGrid(value: number, span: number) {

    const within = ((value % span) + span) % span

    return closeTo(within, 0) || closeTo(within, span)
}

function startsAtBoundary(value: Value, resolved: number, span: number) {

    if (span) return onGrid(resolved, span)

    // Without a measured span, the surface's first edge is half of it before the center.
    return equal(value, -0.5, 0)
}

function endsAtBoundary(position: Value, size: Value, resolvedPosition: number, resolvedSize: number, span: number) {

    if (span) return onGrid(resolvedPosition + resolvedSize, span)

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
