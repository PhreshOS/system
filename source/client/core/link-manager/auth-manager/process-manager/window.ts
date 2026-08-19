import { type TransmittedWindow, type Position, type Size } from "@server/core/link-manager/auth-manager/process-manager/window"
import { isRelativeValue, type WindowGeometry, type WindowLayer } from "@phreshos/core"
import ProcessManager from "./process-manager"

/**
 * How a process is shown, as this side holds it. The values are the core's
 * own — pixels or linear expressions of relative and pixel terms — and every
 * operation is a request: the truth changes on the server and the echo lands
 * back here, so a window never moves because a session wished it.
 *
 * Its own instance, rebuilt from what crossed. It shares no code with
 * the core's window; they are alike because they are the same idea.
 */
export default class Window {

    public readonly processManager: ProcessManager

    public readonly process: string

    public position: Position

    public size: Size

    public depth: number

    public minimized: boolean

    // What is shown on it, born from its program when the window was
    // made. Not looked up again: how a thing is shown is not a fact
    // about whether its program is installed. Changeable, because the
    // window owns it.
    public title: string

    public url: string | null

    // The authoritative runtime layer, including the system-only wallpaper.
    public layer: WindowLayer

    // Which of the half's own pages the frame opens on.
    public location: string

    public constructor(processManager: ProcessManager, process: string, payload: TransmittedWindow) {

        this.title = payload.title

        this.layer = payload.layer

        this.location = payload.location

        this.url = payload.url

        this.processManager = processManager

        this.process = process

        this.position = payload.position

        this.size = payload.size

        this.depth = payload.depth

        this.minimized = payload.minimized

    }

    // What the echo carries, applied whole: one shape for any change.
    public follow(payload: TransmittedWindow) {

        this.title = payload.title

        this.url = payload.url

        this.layer = payload.layer

        this.location = payload.location

        this.position = payload.position

        this.size = payload.size

        this.depth = payload.depth

        this.minimized = payload.minimized

    }

    // A local geometry change is a draft held by this desktop. It redraws
    // through ProcessManager but says nothing through `$outbound`; the normal
    // move and resize methods remain the only roads to the authoritative host.
    public localMove(position: Position) {

        validate(position.x, "x")

        validate(position.y, "y")

        this.position = position
    }

    public localResize(size: Size) {

        validate(size.width, "width")

        validate(size.height, "height")

        this.size = size
    }

    /** Applies a complete desktop-local draft in one notification cycle. */
    public localSetGeometry(geometry: WindowGeometry) {

        validate(geometry.position.x, "x")

        validate(geometry.position.y, "y")

        validate(geometry.size.width, "width")

        validate(geometry.size.height, "height")

        this.position = geometry.position

        this.size = geometry.size
    }

    public async move(position: Position) {

        await this.processManager.$outbound.publish("/move", this.process, position)
    }

    public async resize(size: Size) {

        await this.processManager.$outbound.publish("/resize", this.process, size)
    }

    public async setGeometry(geometry: WindowGeometry) {

        await this.processManager.$outbound.publish("/geometry", this.process, geometry)
    }

    public async changeTitle(title: string) {

        await this.processManager.$outbound.publish("/change-title", this.process, title)
    }

    // To the front of its own layer, and nothing else. A hidden window
    // raised stays hidden and appears at its new place in the order when
    // it is shown.
    public async raise() {

        await this.processManager.$outbound.publish("/raise", this.process)
    }

    public async minimize(minimized: boolean) {

        await this.processManager.$outbound.publish("/minimize", this.process, minimized)
    }
}

function validate(value: number | string, name: string) {

    if (isRelativeValue(value)) return

    throw new Error(`${name} must be a finite pixel number or a relative expression such as "50% + 10"`)
}

export type { Position, Size }
