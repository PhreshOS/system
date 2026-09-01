import { type RefObject } from "react"
import TheLink from "@libs/the-link/the-link"
import { type DesktopPointerPosition, type DesktopPointerSnapshot } from "@phreshos/core"

/**
 * Pointer state belongs to one desktop session. Programs may observe it,
 * but they neither own the listener nor receive another frame's lease.
 */
export default class DesktopPointer extends TheLink implements PointerHost {

    private latest: DesktopPointerPosition | null = null

    public constructor(private readonly desktop: RefObject<HTMLDivElement | null>) {

        super()
    }

    public listen() {

        const desktop = this.desktop.current

        if (!desktop) return () => undefined

        const move = (event: PointerEvent) => {

            const bounds = desktop.getBoundingClientRect()

            const position = {

                x: event.clientX - bounds.left,

                y: event.clientY - bounds.top
            }

            this.latest = position

            this.$inbound.publish("move", position).catch(() => undefined)
        }

        desktop.addEventListener("pointermove", move)

        return () => {

            desktop.removeEventListener("pointermove", move)
        }
    }

    public snapshot(): DesktopPointerSnapshot {

        return { position: this.latest }
    }

}

export interface PointerHost {

    snapshot(): DesktopPointerSnapshot

    readonly $inbound: TheLink["$inbound"]
}
