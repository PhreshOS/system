import { type WindowSnapshot, type Position, type Size } from "@server/core/link-manager/auth-manager/process-manager/window"
import { type WindowGeometry, type WindowLayer } from "@phreshos/core"
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

    // The authoritative Desktop layer.
    public layer: WindowLayer

    // Which of the half's own pages the frame opens on.
    public location: string

    public constructor(processManager: ProcessManager, process: string, payload: WindowSnapshot) {

        this.title = payload.title

        this.layer = payload.layer

        this.location = payload.location

        this.processManager = processManager

        this.process = process

        this.position = payload.position

        this.size = payload.size

        this.depth = payload.depth

        this.minimized = payload.minimized

    }

    // What the echo carries, applied whole: one shape for any change.
    public follow(payload: WindowSnapshot) {

        this.title = payload.title

        this.layer = payload.layer

        this.location = payload.location

        this.position = payload.position

        this.size = payload.size

        this.depth = payload.depth

        this.minimized = payload.minimized

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

export type { Position, Size }
