import {
    parseWindowPresentationSurface,
    parseWindowPresentationTransaction,
    type WindowLayer,
    type WindowMoveGestureStart,
    type WindowMovePoint,
    type WindowPresentationGeometry,
    type WindowPresentationPosition,
    type WindowPresentationSize,
    type WindowPresentationSurface,
    type WindowPresentationTransaction
} from "@phreshos/core"

export type PresentationAnimation = Readonly<{
    revision: number
    transaction?: WindowPresentationTransaction
}>

export type PresentationTransactionRequest = Readonly<{
    transaction?: WindowPresentationTransaction
    wait: boolean
}>

export type PresentationMovePoint = Readonly<{ x: number, y: number }>

/** The frame one Client document is drawn in, as the Desktop sees it. */
export interface PresentationFrame {
    readonly element: HTMLIFrameElement

    /** Where a point of the Client document is in the Desktop's viewport. */
    point(point: WindowMovePoint): PresentationMovePoint
}

export interface PresentationMoveGestureController {
    begin(origin: PresentationMovePoint, point: PresentationMovePoint): PresentationMoveGesture
    cancel(): void
}

export interface PresentationMoveGesture {
    ready: Promise<void>
    finished: Promise<void>
    cancel(): void
}

/** How one Client is actually drawn on this Desktop, as its presentation reads it. */
export type WindowPresentationDrawing = Readonly<{
    layer: WindowLayer
    position: WindowPresentationPosition
    size: WindowPresentationSize
    front: boolean
    interactive: boolean
    surface: WindowPresentationSurface
}>

/** Local commands available to the current Client representation. */
export interface WindowPresentationHost {
    begin(identity: string): void
    drawing(identity: string, frame: HTMLIFrameElement): WindowPresentationDrawing
    settled(identity: string): boolean
    observe(listener: () => void): () => void
    beginMoveGesture(identity: string, gesture: string, origin: PresentationMovePoint, point: PresentationMovePoint): Promise<void>
    waitMoveGesture(identity: string, gesture: string): Promise<void>
    cancelMoveGesture(identity: string, gesture: string): void
    cancelMoveGestures(identity: string): void
    move(identity: string, position: WindowPresentationPosition, transaction?: PresentationTransactionRequest): Promise<void>
    resize(identity: string, size: WindowPresentationSize, transaction?: PresentationTransactionRequest): Promise<void>
    setGeometry(identity: string, geometry: WindowPresentationGeometry, transaction?: PresentationTransactionRequest): Promise<void>
    setSurface(identity: string, surface: WindowPresentationSurface, transaction?: PresentationTransactionRequest): Promise<void>
    setInteractive(identity: string, interactive: boolean): void
    raise(identity: string): void
    complete(identity: string, kind: "geometry" | "surface", revision: number): void
}

export function presentationMovePoint(value: unknown): WindowMovePoint {
    const record = plain(value, "Window move point")
    if (typeof record.x !== "number" || !Number.isFinite(record.x)) throw new Error("Window move point x must be a finite number")
    if (typeof record.y !== "number" || !Number.isFinite(record.y)) throw new Error("Window move point y must be a finite number")
    return Object.freeze({ x: record.x, y: record.y })
}

export function presentationMoveGestureStart(value: unknown): WindowMoveGestureStart {
    const record = plain(value, "Window move gesture start")
    return Object.freeze({ origin: presentationMovePoint(record.origin), point: presentationMovePoint(record.point) })
}

/** The drawing is written in pixels; shares belong to the Window, which every Desktop resolves itself. */
export function presentationPosition(value: unknown): WindowPresentationPosition {
    const record = plain(value, "Window presentation position")
    return Object.freeze({ x: pixels(record.x, "x"), y: pixels(record.y, "y") })
}

export function presentationSize(value: unknown): WindowPresentationSize {
    const record = plain(value, "Window presentation size")
    return Object.freeze({ width: pixels(record.width, "width"), height: pixels(record.height, "height") })
}

export function presentationGeometry(value: unknown): WindowPresentationGeometry {
    const record = plain(value, "Window presentation geometry")
    return Object.freeze({ x: pixels(record.x, "x"), y: pixels(record.y, "y"), width: pixels(record.width, "width"), height: pixels(record.height, "height") })
}

export function presentationSurface(value: unknown) {
    return parseWindowPresentationSurface(value)
}

export function presentationTransaction(value: unknown): PresentationTransactionRequest | undefined {
    if (value === null || value === undefined) return undefined
    const selected = plain(value, "Window presentation transaction selection")
    if (typeof selected.wait !== "boolean") throw new Error("A Window presentation wait value must be true or false")
    return Object.freeze({
        ...selected.transaction === undefined ? {} : { transaction: parseWindowPresentationTransaction(selected.transaction) },
        wait: selected.wait
    })
}

function pixels(value: unknown, name: string) {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Window presentation ${name} must be a finite number of pixels`)
    return value
}

function plain(value: unknown, name: string): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${name} must be an object`)
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) throw new Error(`${name} must be an object`)
    return value as Record<string, unknown>
}
