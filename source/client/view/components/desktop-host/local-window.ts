import {
    appearanceLimits,
    isRelativeValue,
    type AppearanceTransaction,
    type Easing,
    type Position,
    type Size,
    type WaitedTransaction,
    type WindowGeometry,
    type WindowLayer,
    type WindowState
} from "@phreshos/core"

export type LocalAnimation = Readonly<{
    revision: number
    transaction: AppearanceTransaction
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
    minimizeAnimation: LocalAnimation | null
}>

/** The only interface through which an iframe changes its local representation. */
export interface LocalWindowHost {
    state(identity: string): WindowState
    move(identity: string, position: Position, transaction?: AppearanceTransaction | WaitedTransaction): Promise<void>
    resize(identity: string, size: Size, transaction?: AppearanceTransaction | WaitedTransaction): Promise<void>
    geometry(identity: string, geometry: WindowGeometry, transaction?: AppearanceTransaction | WaitedTransaction): Promise<void>
    maximize(identity: string, maximized: boolean, transaction?: AppearanceTransaction | WaitedTransaction): Promise<void>
    minimize(identity: string, minimized: boolean, transaction?: AppearanceTransaction | WaitedTransaction): Promise<void>
    follow(identity: string, target: string, transaction?: AppearanceTransaction | WaitedTransaction): Promise<void>
    unfollow(identity: string, transaction?: AppearanceTransaction | WaitedTransaction): Promise<void>
    title(identity: string, title: string): void
    raise(identity: string): void
    addSurface(identity: string, transaction?: AppearanceTransaction | WaitedTransaction): Promise<void>
    removeSurface(identity: string, transaction?: AppearanceTransaction | WaitedTransaction): Promise<void>
    complete(identity: string, kind: "geometry" | "minimize" | "surface", revision: number): void
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

export function parseLocalWindowTransaction(value: unknown): AppearanceTransaction | WaitedTransaction | undefined {
    if (value === undefined) return undefined

    const record = plain(value, "Appearance transaction")
    fields(record, ["duration", "easing", "wait"], "Appearance transaction")

    if (!("duration" in record) || !("easing" in record)) throw new Error("An Appearance transaction must provide duration and easing")
    const { minimum, maximum } = appearanceLimits.transaction.duration
    if (!finite(record.duration) || record.duration < minimum || record.duration > maximum) throw new Error(`Appearance transaction duration must be finite milliseconds from ${minimum} to ${maximum}`)

    const result: { duration: number, easing: Easing, wait?: true } = {
        duration: record.duration,
        easing: easing(record.easing)
    }

    if ("wait" in record) {

        if (record.wait !== true) throw new Error("Appearance transaction wait must be true when present")
        result.wait = true
    }

    return Object.freeze(result)
}

export function requireLocalSurfaceLayer(layer: WindowLayer) {

    if (layer === "window") throw new Error("A standard Window already owns its host Surface")
}

function easing(value: unknown): Easing {
    if (value === "linear" || value === "ease" || value === "ease-in" || value === "ease-out" || value === "ease-in-out") return value
    if (!Array.isArray(value) || value.length !== 4 || !value.every(finite) || value[0] < 0 || value[0] > 1 || value[2] < 0 || value[2] > 1) throw new Error("Appearance transaction easing must be a standard easing name or four cubic Bézier numbers with x values from 0 to 1")
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
