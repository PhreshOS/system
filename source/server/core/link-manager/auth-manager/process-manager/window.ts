import { isRelativeValue, type Position, type Size, type Value, type WindowGeometry, type WindowLayer, type WindowState } from "@phreshos/core"

/** Authoritative geometry, visibility, maximization, title, and layer ordering. */
// What a Window says about the Program behind it. Resolved when the Process
// first gains Window state and again only when a stopped client is restarted
// with explicit overrides; ordinary live Window operations remain narrower.
export interface Shown {

    title: string

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

    // The Window's authoritative Desktop layer.
    public readonly layer: WindowLayer

    public constructor(shown: Shown, position: Position, size: Size, depth: number, minimized: boolean, maximized = false) {

        this.title = shown.title

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

        this.position = position
    }

    public resize(size: Size) {

        validate(size.width, "width")

        validate(size.height, "height")

        this.size = size
    }

    /** Validates and commits a complete geometry without an intermediate state. */
    public setGeometry(geometry: WindowGeometry) {

        validate(geometry.position.x, "x")

        validate(geometry.position.y, "y")

        validate(geometry.size.width, "width")

        validate(geometry.size.height, "height")

        this.position = geometry.position

        this.size = geometry.size
    }

    public changeTitle(title: string) {

        const said = String(title ?? "").trim()

        if (!said) throw new Error("A window's title is something a person can read")

        this.title = said
    }

    public toJSON() {

        return {

            title: this.title,

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
