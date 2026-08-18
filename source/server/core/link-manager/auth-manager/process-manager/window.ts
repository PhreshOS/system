import { isRelativeValue, isScaleLevel, type Position, type ScaleLevel, type Size, type Value, type WindowLayer, type WindowSurfaceEasing, type WindowSurfaceSettings, type WindowSurfaceTransaction } from "@phreshos/core"
import { Transmitted } from "@libs/superjson"

/**
 * How a process is shown. Every value is either a number of pixels or a
 * linear expression of workspace-relative and pixel terms — so a window can
 * be absolute in one axis and relative in the other, and arrangements no
 * vocabulary anticipated (a third-width sidebar, a full-width dock sixty
 * pixels tall) are simply values.
 *
 * A share is resolved by each client in its own layer workspace. Margins
 * and gutters are presentation outside this value, so pixels and shares
 * use one coordinate space and neither carries desktop arithmetic.
 *
 * **Geometry, visibility and order are three questions**, and no word
 * here answers two of them. A hidden window can be moved, resized and
 * reordered, and none of that shows it; showing it shows it wherever it
 * now is and wherever the order now puts it. There is nothing to
 * remember and nothing to restore, which is why the two `previous`
 * fields are gone: they existed to undo `maximize`, and filling the
 * surface is a size like any other now.
 *
 * **What is shown lives here, not on the process.** A title and
 * where the frame is filled from are all "how this is shown", the same
 * kind of fact as a size — and `client.size` already becomes
 * `window.size`, so `title` becomes `window.title` by the same road. A
 * process with no window needs none of them, and had to carry them all
 * while they sat on the process.
 *
 * The title is the window's own from the moment it opens: born from what
 * the client half declared, or the program's name when it declared
 * nothing, and changeable afterwards. A window showing one file of many
 * is the ordinary case, and a program that cannot say so has to put the
 * whole story in its own frame.
 *
 * **Front is not kept here.** Which window is at the front is a fact about
 * all of them at once — the un-minimized one with the greatest depth —
 * so it is answered where every window is in view, and a flag stored
 * per window could disagree with what is drawn. `depth` is how that is
 * worked out and stays the host's: a number a program could read but
 * never interpret is a mechanism leaking through the contract.
 */
// What a Window says about the Program behind it. Resolved when the Process
// first gains Window state and again only when a stopped client is restarted
// with explicit overrides; ordinary live Window operations remain narrower.
export interface Shown {

    title: string

    url: string | null

    // Which runtime layer this Window occupies. Ordinary clients are confined
    // to the three authorable layers; the system assigns its wallpaper Window
    // the dedicated fourth value.
    layer: WindowLayer

    // Which page of the client half to open, beneath its declared root.
    // `/` is the root itself, so absence never has a second meaning.
    location: string
}

export default class Window {

    public position: Position

    public size: Size

    public depth: number

    // Whether it is shown. A window may be born hidden, which is a
    // state at birth rather than an act afterwards: hidden from the
    // first frame is not the same as shown once and then hidden.
    public minimized: boolean

    // Optional host material is Window state like geometry: born absent,
    // changed only here, and echoed whole to every desktop counterpart.
    public surface: WindowSurfaceSettings | null = null

    // What a person reads on it. Born from the program, the window's
    // own afterwards.
    public title: string

    // Where the frame is filled from, when it is not the program asset route: a
    // client half may name a URL instead of a directory, which is what
    // lets a program under development be shown from its own dev server.
    public readonly url: string | null

    // The Window's authoritative runtime layer. `wallpaper` can only be
    // assigned by the system's dedicated wallpaper launch path.
    public readonly layer: WindowLayer

    // Which of the half's own pages the frame opens on.
    public readonly location: string

    public constructor(shown: Shown, position: Position, size: Size, depth: number, minimized: boolean) {

        this.title = shown.title

        this.url = shown.url

        this.layer = shown.layer

        this.location = shown.location

        this.position = position

        this.size = size

        validate(position.x, "x")

        validate(position.y, "y")

        validate(size.width, "width")

        validate(size.height, "height")

        this.depth = depth

        this.minimized = minimized
    }

    // ── The primitives, and each does only its own work ──────────────
    //
    // Geometry, visibility and order are three questions, and no word
    // here answers two of them. A window that is moved while hidden is
    // moved; showing it again shows it where it now is, because nothing
    // was remembered to put it back to. Raising a hidden window changes
    // where it will appear, not whether it appears.
    //
    // Filling the surface used to be an act with a name, and a name
    // needed a memory: `previousPosition` and `previousSize` existed to
    // undo `maximize` and were read by nothing else. Both are gone. A
    // window that wants the whole surface asks for the whole surface —
    // and the button that does it in the interface keeps its own memory
    // of where the window was, which is the window manager's business
    // and not the system's.
    public move(position: Position) {

        validate(position.x, "x")

        validate(position.y, "y")

        this.position = position
    }

    public resize(size: Size) {

        validate(size.width, "width")

        validate(size.height, "height")

        this.size = size
    }

    public changeTitle(title: string) {

        const said = String(title ?? "").trim()

        if (!said) throw new Error("A window's title is something a person can read")

        this.title = said
    }

    public setSurface(value: unknown) {

        const surface = validateSurface(value)

        if (sameSurface(this.surface, surface)) return false

        this.surface = surface

        return true
    }

    public removeSurface() {

        if (this.surface === null) return false

        this.surface = null

        return true
    }

    public toJSON() {

        return {

            title: this.title,

            url: this.url,

            layer: this.layer,

            location: this.location,

            position: this.position,

            size: this.size,

            depth: this.depth,

            minimized: this.minimized,

            surface: this.surface
        }
    }
}

function validateSurface(value: unknown): WindowSurfaceSettings {

    if (value === undefined) return Object.freeze({})

    const record = plain(value, "Surface settings")

    fields(record, ["opacity", "radius", "transaction"], "Surface settings")

    const surface: { opacity?: number, radius?: ScaleLevel | number | "full", transaction?: WindowSurfaceTransaction } = {}

    if ("opacity" in record) {

        if (!finite(record.opacity) || record.opacity < 0 || record.opacity > 1) throw new Error("Surface opacity must be a finite number from 0 to 1")

        surface.opacity = record.opacity
    }

    if ("radius" in record) {

        if (record.radius !== "full" && !isScaleLevel(record.radius) && (!finite(record.radius) || record.radius < 0)) throw new Error('Surface radius must be a ScaleLevel, a finite nonnegative pixel number, or "full"')

        surface.radius = record.radius
    }

    if ("transaction" in record) surface.transaction = validateTransaction(record.transaction)

    return Object.freeze(surface)
}

function validateTransaction(value: unknown): WindowSurfaceTransaction {

    const record = plain(value, "Surface transaction")

    fields(record, ["duration", "easing"], "Surface transaction")

    const transaction: { duration?: number, easing?: WindowSurfaceEasing } = {}

    if ("duration" in record) {

        if (!finite(record.duration) || record.duration < 0 || record.duration > 60_000) throw new Error("Surface transaction duration must be finite milliseconds from 0 to 60000")

        transaction.duration = record.duration
    }

    if ("easing" in record) transaction.easing = validateEasing(record.easing)

    return Object.freeze(transaction)
}

function validateEasing(value: unknown): WindowSurfaceEasing {

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

function sameSurface(left: WindowSurfaceSettings | null, right: WindowSurfaceSettings) {

    return JSON.stringify(left) === JSON.stringify(right)
}

// A value is pixels or one linear relative expression; anything else is
// refused where it is written, not where it is rendered.
function validate(value: Value, name: string) {

    if (isRelativeValue(value)) return

    throw new Error(`${name} must be a finite pixel number or a relative expression such as "50% + 10"`)
}

export type TransmittedWindow = Transmitted<Window>

export type { Position, Size, Value } from "@phreshos/core"
