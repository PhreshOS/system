import { isScaleLevel, type ClientSurfaceEasing, type ClientSurfaceSettings, type ClientSurfaceTransaction, type ScaleLevel } from "@phreshos/core"

/** Desktop-local Surface commands applied to one exact iframe representation. */
export interface ClientSurfaceHost {

    set(identity: string, settings: ClientSurfaceSettings): void

    remove(identity: string): void
}

/** Render target retained only while one iframe representation is alive. */
export interface ClientSurfaceState {

    settings: ClientSurfaceSettings

    revision: number
}

export function setClientSurface(current: ReadonlyMap<string, ClientSurfaceState>, identity: string, settings: ClientSurfaceSettings) {

    const previous = current.get(identity)

    if (previous && JSON.stringify(previous.settings) === JSON.stringify(settings)) return current

    const next = new Map(current)

    next.set(identity, { settings, revision: (previous?.revision ?? 0) + 1 })

    return next
}

export function removeClientSurface(current: ReadonlyMap<string, ClientSurfaceState>, identity: string) {

    if (!current.has(identity)) return current

    const next = new Map(current)

    next.delete(identity)

    return next
}

/** Rejects malformed representation input before it can enter desktop state. */
export function clientSurfaceSettings(value: unknown): ClientSurfaceSettings {

    const record = plain(value, "Surface settings")

    fields(record, ["opacity", "radius", "transaction"], "Surface settings")

    const settings: { opacity?: number, radius?: ScaleLevel | number | "full", transaction?: ClientSurfaceTransaction } = {}

    if ("opacity" in record) {

        if (!finite(record.opacity) || record.opacity < 0 || record.opacity > 1) throw new Error("Surface opacity must be a finite number from 0 to 1")

        settings.opacity = record.opacity
    }

    if ("radius" in record) {

        if (record.radius !== "full" && !isScaleLevel(record.radius) && (!finite(record.radius) || record.radius < 0)) throw new Error('Surface radius must be a ScaleLevel, a finite nonnegative pixel number, or "full"')

        settings.radius = record.radius
    }

    if ("transaction" in record) settings.transaction = transaction(record.transaction)

    return Object.freeze(settings)
}

function transaction(value: unknown): ClientSurfaceTransaction {

    const record = plain(value, "Surface transaction")

    fields(record, ["duration", "easing"], "Surface transaction")

    const result: { duration?: number, easing?: ClientSurfaceEasing } = {}

    if ("duration" in record) {

        if (!finite(record.duration) || record.duration < 0 || record.duration > 60_000) throw new Error("Surface transaction duration must be finite milliseconds from 0 to 60000")

        result.duration = record.duration
    }

    if ("easing" in record) result.easing = easing(record.easing)

    return Object.freeze(result)
}

function easing(value: unknown): ClientSurfaceEasing {

    if (value === "linear" || value === "ease" || value === "ease-in" || value === "ease-out" || value === "ease-in-out") return value

    if (!Array.isArray(value) || value.length !== 4 || !value.every(finite) || value[0] < 0 || value[0] > 1 || value[2] < 0 || value[2] > 1) throw new Error("Surface transaction easing must be a standard easing name or four cubic Bézier numbers with x values from 0 to 1")

    return Object.freeze([...value]) as [number, number, number, number]
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
