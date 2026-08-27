import {
    isRelativeValue,
    type Easing,
    type Position,
    type Size,
    type Transaction,
    type VisibilityTransition,
    type WindowGeometry,
    type WindowLayer,
    type WindowState
} from "@phreshos/core"

export type LocalAnimation = Readonly<{
    revision: number
    transaction: Transaction
}>

export type LocalSurfaceState = Readonly<{
    visible: boolean
    transition: LocalAnimation | null
}>

/** Everything physically represented by one exact live Client iframe. */
export type LocalWindowState = WindowState & Readonly<{
    depth: number
    surface: LocalSurfaceState | null
    geometryAnimation: LocalAnimation | null
}>

/** The only interface through which an iframe changes its local representation. */
export interface LocalWindowHost {
    state(identity: string): WindowState
    move(identity: string, position: Position, transaction?: Transaction): Promise<void>
    resize(identity: string, size: Size, transaction?: Transaction): Promise<void>
    geometry(identity: string, geometry: WindowGeometry, transaction?: Transaction): Promise<void>
    minimize(identity: string, minimized: boolean): void
    title(identity: string, title: string): void
    raise(identity: string): void
    setSurface(identity: string, transition: VisibilityTransition): Promise<void>
    removeSurface(identity: string, transition: VisibilityTransition): Promise<void>
    complete(identity: string, kind: "geometry" | "surface", revision: number): void
    release(identity: string): void
}

export function localPosition(value: unknown): Position {
    const record = plain(value, "Local Window position")
    fields(record, ["x", "y"], "Local Window position")
    valueTerm(record.x, "x")
    valueTerm(record.y, "y")
    return Object.freeze({ x: record.x, y: record.y }) as Position
}

export function localSize(value: unknown): Size {
    const record = plain(value, "Local Window size")
    fields(record, ["width", "height"], "Local Window size")
    valueTerm(record.width, "width")
    valueTerm(record.height, "height")
    return Object.freeze({ width: record.width, height: record.height }) as Size
}

export function localGeometry(value: unknown): WindowGeometry {
    const record = plain(value, "Local Window geometry")
    fields(record, ["position", "size"], "Local Window geometry")
    return Object.freeze({ position: localPosition(record.position), size: localSize(record.size) })
}

export function visualTransaction(value: unknown): Transaction | undefined {
    if (value === undefined) return undefined

    const record = plain(value, "Transaction")
    fields(record, ["duration", "easing", "wait"], "Transaction")

    if (!("duration" in record) && !("easing" in record)) throw new Error("A Transaction must provide duration or easing")

    const result: { duration?: number, easing?: Easing, wait?: boolean } = {}

    if ("duration" in record) {

        if (!finite(record.duration) || record.duration < 0 || record.duration > 60_000) throw new Error("Transaction duration must be finite milliseconds from 0 to 60000")
        result.duration = record.duration
    }

    if ("easing" in record) result.easing = easing(record.easing)

    if ("wait" in record) {

        if (typeof record.wait !== "boolean") throw new Error("Transaction wait must be a boolean")
        result.wait = record.wait
    }

    return Object.freeze(result) as Transaction
}

export function visibilityTransition(value: unknown): VisibilityTransition {
    const transition = visualTransaction(value)
    if (!transition) throw new Error("A VisibilityTransition is required")
    return transition
}

export function layerAllowsSurface(layer: WindowLayer) {

    if (layer === "window") throw new Error("A window-layer representation cannot own a Surface")
}

function easing(value: unknown): Easing {
    if (value === "linear" || value === "ease" || value === "ease-in" || value === "ease-out" || value === "ease-in-out") return value
    if (!Array.isArray(value) || value.length !== 4 || !value.every(finite) || value[0] < 0 || value[0] > 1 || value[2] < 0 || value[2] > 1) throw new Error("Transaction easing must be a standard easing name or four cubic Bézier numbers with x values from 0 to 1")
    return Object.freeze([...value]) as [number, number, number, number]
}

function valueTerm(value: unknown, name: string) {

    if (!finite(value) && !isRelativeValue(value)) throw new Error(`Local Window ${name} must be a finite number or relative value`)
}

function plain(value: unknown, name: string): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${name} must be an object`)
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) throw new Error(`${name} must be an object`)
    return value as Record<string, unknown>
}

function fields(record: Record<string, unknown>, allowed: string[], name: string) {

    const unknown = Object.keys(record).find(field => !allowed.includes(field))
    if (unknown) throw new Error(`${name} has no "${unknown}" field`)
}

function finite(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value)
}
