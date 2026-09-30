import {
    parsePresentationSurface,
    parsePresentationTransaction,
    type WindowLayer,
    type PresentationMoveGestureStart,
    type PresentationMovePoint,
    type PresentationGeometry,
    type PresentationAnchor,
    type PresentationPosition,
    type PresentationSize,
    type PresentationSurface,
    type PresentationTransaction
} from "@phreshos/core"

export type PresentationAnimation = Readonly<{
    revision: number
    transaction?: PresentationTransaction
}>

export type PresentationTransactionRequest = Readonly<{
    transaction?: PresentationTransaction
    wait: boolean
}>

export type DesktopMovePoint = Readonly<{ x: number, y: number }>

/** The frame one Client document is drawn in, as the Desktop sees it. */
export interface PresentationFrame {
    readonly element: HTMLIFrameElement

    /** Where a point of the Client document is in the Desktop's viewport. */
    point(point: PresentationMovePoint): DesktopMovePoint
}

export interface DesktopMoveGestureController {
    begin(origin: DesktopMovePoint, point: DesktopMovePoint): DesktopMoveGesture
    cancel(): void
}

export interface DesktopMoveGesture {
    ready: Promise<void>
    finished: Promise<void>
    cancel(): void
}

/** How one Client is actually drawn on this Desktop, as its presentation reads it. */
export type PresentationState = Readonly<{
    layer: WindowLayer
    anchor: PresentationAnchor
    position: PresentationPosition
    size: PresentationSize
    front: boolean
    interactive: boolean
    surface: PresentationSurface
}>

/** Local commands available to the current Client representation. */
export interface PresentationHost {
    begin(identity: string): void
    drawing(identity: string, frame: HTMLIFrameElement): PresentationState
    observe(listener: () => void): () => void
    beginMoveGesture(identity: string, gesture: string, origin: DesktopMovePoint, point: DesktopMovePoint): Promise<void>
    waitMoveGesture(identity: string, gesture: string): Promise<void>
    cancelMoveGesture(identity: string, gesture: string): void
    cancelMoveGestures(identity: string): void
    move(identity: string, position: PresentationPosition, transaction?: PresentationTransactionRequest): Promise<void>
    resize(identity: string, size: PresentationSize, transaction?: PresentationTransactionRequest): Promise<void>
    setGeometry(identity: string, geometry: PresentationGeometry, transaction?: PresentationTransactionRequest): Promise<void>
    setSurface(identity: string, surface: PresentationSurface, transaction?: PresentationTransactionRequest): Promise<void>
    setInteractive(identity: string, interactive: boolean): void
    setAnchor(identity: string, anchor: PresentationAnchor): void
    raise(identity: string): void
    complete(identity: string, kind: "geometry" | "surface", revision: number): void
}

export function presentationMovePoint(value: unknown): PresentationMovePoint {
    const record = plain(value, "Window move point")
    if (typeof record.x !== "number" || !Number.isFinite(record.x)) throw new Error("Window move point x must be a finite number")
    if (typeof record.y !== "number" || !Number.isFinite(record.y)) throw new Error("Window move point y must be a finite number")
    return Object.freeze({ x: record.x, y: record.y })
}

export function presentationMoveGestureStart(value: unknown): PresentationMoveGestureStart {
    const record = plain(value, "Window move gesture start")
    return Object.freeze({ origin: presentationMovePoint(record.origin), point: presentationMovePoint(record.point) })
}

/** The drawing is written in pixels; shares belong to the Window, which every Desktop resolves itself. */
export function presentationPosition(value: unknown): PresentationPosition {
    const record = plain(value, "Presentation position")
    return Object.freeze({ x: pixels(record.x, "x"), y: pixels(record.y, "y") })
}

export function presentationSize(value: unknown): PresentationSize {
    const record = plain(value, "Presentation size")
    return Object.freeze({ width: pixels(record.width, "width"), height: pixels(record.height, "height") })
}

export function presentationGeometry(value: unknown): PresentationGeometry {
    const record = plain(value, "Presentation geometry")
    return Object.freeze({ x: pixels(record.x, "x"), y: pixels(record.y, "y"), width: pixels(record.width, "width"), height: pixels(record.height, "height") })
}

export function presentationSurface(value: unknown) {
    return parsePresentationSurface(value)
}

export function presentationTransaction(value: unknown): PresentationTransactionRequest | undefined {
    if (value === null || value === undefined) return undefined
    const selected = plain(value, "Presentation transaction selection")
    if (typeof selected.wait !== "boolean") throw new Error("A presentation wait value must be true or false")
    return Object.freeze({
        ...selected.transaction === undefined ? {} : { transaction: parsePresentationTransaction(selected.transaction) },
        wait: selected.wait
    })
}

function pixels(value: unknown, name: string) {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Presentation ${name} must be a finite number of pixels`)
    return value
}

function plain(value: unknown, name: string): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${name} must be an object`)
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) throw new Error(`${name} must be an object`)
    return value as Record<string, unknown>
}
