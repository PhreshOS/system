import {
    isRelativeValue,
    parseWindowSurface,
    parseWindowTransaction,
    type Position,
    type Size,
    type WindowSurface,
    type WindowGeometry,
    type WindowState,
    type WindowTransaction
} from "@phreshos/core"
import type { WindowPresentationProperty } from "@shared/window-layers"

export type PresentationAnimation = Readonly<{
    revision: number
    transaction: WindowTransaction
}>

/** Values this Desktop relies on for one Client Window, not measured rendered output. */
export type WindowPresentationState = WindowState & Readonly<{
    depth: number
    surfaceAnimation: PresentationAnimation | null
    geometryAnimation: PresentationAnimation | null
    minimizeAnimation: PresentationAnimation | null
}>

export type PresentationTransactionRequest = Readonly<{
    transaction: WindowTransaction
    wait: boolean
}>

/** The only interface through which an iframe changes or observes its Desktop presentation. */
export interface WindowPresentationHost {
    /** Begins a new iframe presentation from the authoritative Window state. */
    begin(identity: string): void
    read(identity: string, property: WindowPresentationProperty): unknown
    move(identity: string, position: Position, transaction?: PresentationTransactionRequest): Promise<void>
    resize(identity: string, size: Size, transaction?: PresentationTransactionRequest): Promise<void>
    setGeometry(identity: string, geometry: WindowGeometry, transaction?: PresentationTransactionRequest): Promise<void>
    maximize(identity: string, maximized: boolean, transaction?: PresentationTransactionRequest): Promise<void>
    minimize(identity: string, minimized: boolean, transaction?: PresentationTransactionRequest): Promise<void>
    follow(identity: string, transaction?: PresentationTransactionRequest): Promise<void>
    unfollow(identity: string): Promise<void>
    setTitle(identity: string, title: string): void
    setHeader(identity: string, header: boolean): void
    setSurface(identity: string, surface: WindowSurface, transaction?: PresentationTransactionRequest): Promise<void>
    raise(identity: string): void
    observe(identity: string, event: string | null, listener: (event: string, value: unknown) => void): () => void
    complete(identity: string, kind: "geometry" | "minimize" | "surface", revision: number): void
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
    return parseWindowSurface(value)
}

export function presentationTransaction(value: unknown, wait: unknown): PresentationTransactionRequest | undefined {
    if (value === undefined) return undefined
    if (wait !== undefined && typeof wait !== "boolean") throw new Error("A Window presentation wait value must be true or false")
    return Object.freeze({ transaction: parseWindowTransaction(value), wait: wait === true })
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
