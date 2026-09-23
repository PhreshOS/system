import {
    isRelativeValue,
    parseWindowPresentationSurface,
    parseWindowPresentationTransaction,
    type Position,
    type Size,
    type WindowGeometry,
    type WindowLayer,
    type WindowMoveGestureStart,
    type WindowMovePoint,
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

export interface PresentationMoveCoordinates {
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

/** Local commands available to the current Client representation. */
export interface WindowPresentationHost {
    begin(identity: string): void
    layer(identity: string): WindowLayer
    beginMoveGesture(identity: string, gesture: string, origin: PresentationMovePoint, point: PresentationMovePoint): Promise<void>
    waitMoveGesture(identity: string, gesture: string): Promise<void>
    cancelMoveGesture(identity: string, gesture: string): void
    cancelMoveGestures(identity: string): void
    move(identity: string, position: Position, transaction?: PresentationTransactionRequest): Promise<void>
    resize(identity: string, size: Size, transaction?: PresentationTransactionRequest): Promise<void>
    setGeometry(identity: string, geometry: WindowGeometry, transaction?: PresentationTransactionRequest): Promise<void>
    setSurface(identity: string, surface: WindowPresentationSurface, transaction?: PresentationTransactionRequest): Promise<void>
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

export function presentationPosition(value: unknown): Position {
    const record = plain(value, "Window presentation position")
    valueTerm(record.x, "x")
    valueTerm(record.y, "y")
    return Object.freeze({ x: record.x, y: record.y }) as Position
}

export function presentationSize(value: unknown): Size {
    const record = plain(value, "Window presentation size")
    valueTerm(record.width, "width")
    valueTerm(record.height, "height")
    return Object.freeze({ width: record.width, height: record.height }) as Size
}

export function presentationGeometry(value: unknown): WindowGeometry {
    const record = plain(value, "Window presentation geometry")
    valueTerm(record.x, "x")
    valueTerm(record.y, "y")
    valueTerm(record.width, "width")
    valueTerm(record.height, "height")
    return Object.freeze({ x: record.x, y: record.y, width: record.width, height: record.height }) as WindowGeometry
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

function valueTerm(value: unknown, name: string) {
    if (!isRelativeValue(value)) throw new Error(`Window presentation ${name} must be a finite number or relative value`)
}

function plain(value: unknown, name: string): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${name} must be an object`)
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) throw new Error(`${name} must be an object`)
    return value as Record<string, unknown>
}
