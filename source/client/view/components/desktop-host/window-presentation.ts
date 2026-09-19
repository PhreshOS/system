import {
    isRelativeValue,
    parseWindowFrame,
    parseWindowTransaction,
    type Position,
    type Size,
    type WindowFrame,
    type WindowGeometry,
    type WindowState,
    type WindowTransaction
} from "@phreshos/core"
import type { WindowPresentationProperty } from "@shared/window-layers"

export type PresentationAnimation = Readonly<{
    revision: number
    transaction: WindowTransaction
}>

/** Everything physically represented by one exact live Client iframe. */
export type WindowPresentationState = WindowState & Readonly<{
    depth: number
    frameAnimation: PresentationAnimation | null
    geometryAnimation: PresentationAnimation | null
    minimizeAnimation: PresentationAnimation | null
}>

export type PresentationTransactionRequest = Readonly<{
    transaction: WindowTransaction
    wait: boolean
}>

/** The only interface through which an iframe changes or observes its Desktop presentation. */
export interface WindowPresentationHost {
    read(identity: string, property: WindowPresentationProperty): unknown
    move(identity: string, position: Position, transaction?: PresentationTransactionRequest): Promise<void>
    resize(identity: string, size: Size, transaction?: PresentationTransactionRequest): Promise<void>
    geometry(identity: string, geometry: WindowGeometry, transaction?: PresentationTransactionRequest): Promise<void>
    maximize(identity: string, maximized: boolean, transaction?: PresentationTransactionRequest): Promise<void>
    minimize(identity: string, minimized: boolean, transaction?: PresentationTransactionRequest): Promise<void>
    follow(identity: string, transaction?: PresentationTransactionRequest): Promise<void>
    unfollow(identity: string): Promise<void>
    title(identity: string, title: string): void
    header(identity: string, header: boolean): void
    frame(identity: string, frame: WindowFrame, transaction?: PresentationTransactionRequest): Promise<void>
    raise(identity: string): void
    observe(identity: string, event: string | null, listener: (event: string, value: unknown) => void): () => void
    complete(identity: string, kind: "geometry" | "minimize" | "frame", revision: number): void
    release(identity: string): void
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
    return Object.freeze({ position: presentationPosition(record.position), size: presentationSize(record.size) })
}

export function presentationFrame(value: unknown) {
    return parseWindowFrame(value)
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
