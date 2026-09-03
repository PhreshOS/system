import { isRelativeValue, type Position, type Size, type Value, type WindowGeometry, type WindowLayer } from "@phreshos/core"
import { Transmitted } from "@the-link/messagepack"

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

    // Which structurally isolated Desktop layer this Window occupies.
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

    // What a person reads on it. Born from the program, the window's
    // own afterwards.
    public title: string

    // The Window's authoritative Desktop layer.
    public readonly layer: WindowLayer

    // Which of the half's own pages the frame opens on.
    public readonly location: string

    public constructor(shown: Shown, position: Position, size: Size, depth: number, minimized: boolean) {

        this.title = shown.title

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

            location: this.location,

            position: this.position,

            size: this.size,

            depth: this.depth,

            minimized: this.minimized
        }
    }
}

// A value is pixels or one linear relative expression; anything else is
// refused where it is written, not where it is rendered.
function validate(value: Value, name: string) {

    if (isRelativeValue(value)) return

    throw new Error(`${name} must be a finite pixel number or a relative expression such as "50% + 10"`)
}

export type TransmittedWindow = Transmitted<Window>

export type { Position, Size, Value } from "@phreshos/core"
