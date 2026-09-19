import {
    isRelativeValue,
    parseWindowFrame,
    parseWindowTransaction,
    type Position,
    type Size,
    type Value,
    type WindowFrame,
    type WindowGeometry,
    type WindowLayer,
    type WindowState,
    type WindowTransaction
} from "@phreshos/core"

/** Authoritative geometry, visibility, maximization, title, and layer ordering. */
// What a Window says about the Program behind it. Resolved when the Process
// first gains Window state and again only when a stopped client is restarted
// with explicit overrides; ordinary live Window operations remain narrower.
export interface Shown {

    title: string

    header: boolean

    frame: WindowFrame

    transaction: WindowTransaction

    // Which structurally isolated Desktop layer this Window occupies.
    layer: WindowLayer

}

export default class Window implements Omit<WindowState, "front"> {

    public position: Position

    public size: Size

    public depth: number

    // Whether it is shown. A window may be born hidden, which is a
    // state at birth rather than an act afterwards: hidden from the
    // first frame is not the same as shown once and then hidden.
    public minimized: boolean

    public maximized: boolean

    // What a person reads on it. Born from the program, the window's
    // own afterwards.
    public title: string

    public header: boolean

    // The Window's authoritative Desktop layer.
    public layer: WindowLayer

    public frame: WindowFrame

    public transaction: WindowTransaction

    public constructor(shown: Shown, position: Position, size: Size, depth: number, minimized: boolean, maximized = false) {

        this.title = shown.title

        this.header = shown.header

        this.frame = parseWindowFrame(shown.frame)

        this.transaction = parseWindowTransaction(shown.transaction)

        this.layer = shown.layer

        this.position = position

        this.size = size

        validate(position.x, "x")

        validate(position.y, "y")

        validate(size.width, "width")

        validate(size.height, "height")

        this.depth = depth

        this.minimized = minimized

        this.maximized = maximized
    }

    public move(position: Position) {

        validate(position.x, "x")

        validate(position.y, "y")

        if (this.position.x === position.x && this.position.y === position.y) return false

        this.position = position

        return true
    }

    public resize(size: Size) {

        validate(size.width, "width")

        validate(size.height, "height")

        if (this.size.width === size.width && this.size.height === size.height) return false

        this.size = size

        return true
    }

    /** Validates and commits a complete geometry without an intermediate state. */
    public setGeometry(geometry: WindowGeometry) {

        validate(geometry.position.x, "x")

        validate(geometry.position.y, "y")

        validate(geometry.size.width, "width")

        validate(geometry.size.height, "height")

        const moved = this.position.x !== geometry.position.x || this.position.y !== geometry.position.y

        const resized = this.size.width !== geometry.size.width || this.size.height !== geometry.size.height

        if (!moved && !resized) return { moved, resized }

        this.position = geometry.position

        this.size = geometry.size

        return { moved, resized }
    }

    public changeTitle(title: string) {

        const said = String(title ?? "").trim()

        if (!said) throw new Error("A window's title is something a person can read")

        if (this.title === said) return false

        this.title = said

        return true
    }

    public changeHeader(header: boolean) {

        if (typeof header !== "boolean") throw new Error("Window header state must be true or false")

        if (this.header === header) return false

        this.header = header

        return true
    }

    public changeFrame(frame: WindowFrame) {

        const parsed = parseWindowFrame(frame)

        if (JSON.stringify(this.frame) === JSON.stringify(parsed)) return false

        this.frame = parsed

        return true
    }

    public changeOpeningTransaction(transaction: WindowTransaction) {

        const parsed = parseWindowTransaction(transaction)

        if (JSON.stringify(this.transaction) === JSON.stringify(parsed)) return false

        this.transaction = parsed

        return true
    }

    public toJSON() {

        return {

            title: this.title,

            header: this.header,

            frame: this.frame,

            transaction: this.transaction,

            layer: this.layer,

            position: this.position,

            size: this.size,

            depth: this.depth,

            minimized: this.minimized,

            maximized: this.maximized
        }
    }
}

// A value is pixels or one linear relative expression; anything else is
// refused where it is written, not where it is rendered.
function validate(value: Value, name: string) {

    if (isRelativeValue(value)) return

    throw new Error(`${name} must be a finite pixel number or a relative expression such as "50% + 10"`)
}

export type WindowSnapshot = ReturnType<Window["toJSON"]>

export type { Position, Size, Value } from "@phreshos/core"
