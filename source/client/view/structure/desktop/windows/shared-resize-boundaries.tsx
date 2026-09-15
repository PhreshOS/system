import { type PointerEvent as ReactPointerEvent, useState } from "react"
import { resizeSharedBoundary, sharedResizeBoundaries, type SharedResizeBoundary, type SharedResizeWindow } from "@client/view/components/window-manager/shared-resize"
import { type WindowRegion } from "@client/view/components/window-manager/window-geometry"

const thickness = 4

export default function SharedResizeBoundaries({ windows, begin, present, commit, finish, cancel }: SharedResizeBoundariesProps) {

    const boundaries = sharedResizeBoundaries(windows)

    const [active, setActive] = useState<ActiveBoundary | null>(null)

    function grab(event: ReactPointerEvent<HTMLDivElement>, boundary: SharedResizeBoundary) {

        event.preventDefault()

        const handle = event.currentTarget

        const identities = [...new Set([...boundary.before, ...boundary.after])]

        handle.setPointerCapture(event.pointerId)

        const start = boundary.orientation === "vertical" ? event.clientX : event.clientY

        let gestureWindows: SharedResizeWindow[] | null = null

        let result: ReturnType<typeof resizeSharedBoundary> | null = null

        let frame = 0

        function update(pointer: globalThis.PointerEvent) {

            const coordinate = boundary.orientation === "vertical" ? pointer.clientX : pointer.clientY

            const requestedDelta = coordinate - start

            if (requestedDelta === 0) return

            if (!gestureWindows) {

                const started = begin(identities)

                if (!started) return

                gestureWindows = windows.map(window => ({
                    ...window,
                    geometry: started.get(window.identity) ?? window.geometry
                }))
            }

            result = resizeSharedBoundary(boundary, gestureWindows, requestedDelta)

            if (frame) return

            frame = requestAnimationFrame(function () {

                frame = 0

                if (!result) return

                present(result.geometries)

                setActive({ boundary, delta: result.delta })
            })
        }

        function release(pointer: globalThis.PointerEvent) {

            if (frame) cancelAnimationFrame(frame)

            handle.removeEventListener("pointermove", update)

            handle.removeEventListener("pointerup", release)

            handle.removeEventListener("pointercancel", release)

            if (pointer.type === "pointerup") {

                if (result && result.delta !== 0) {

                    present(result.geometries)

                    commit(result.geometries)

                    finish(identities)
                }

                else if (gestureWindows) cancel(identities)
            }

            else if (gestureWindows) cancel(identities)

            setActive(null)
        }

        handle.addEventListener("pointermove", update)

        handle.addEventListener("pointerup", release)

        handle.addEventListener("pointercancel", release)

        setActive({ boundary, delta: 0 })
    }

    return <div className="pointer-events-none absolute inset-0 z-[2147483647]">

        {(active ? [active.boundary] : boundaries).map(boundary => {

            const delta = active?.boundary.identity === boundary.identity ? active.delta : 0

            const vertical = boundary.orientation === "vertical"

            return <div
                key={boundary.identity}
                data-shared-window-resize={boundary.orientation}
                onPointerDown={event => grab(event, boundary)}
                className={`pointer-events-auto absolute touch-none ${vertical ? "cursor-col-resize" : "cursor-row-resize"}`}
                style={vertical ? {
                    left: boundary.position + delta - thickness / 2,
                    top: boundary.start,
                    width: thickness,
                    height: boundary.end - boundary.start
                } : {
                    left: boundary.start,
                    top: boundary.position + delta - thickness / 2,
                    width: boundary.end - boundary.start,
                    height: thickness
                }}
            />
        })}

    </div>
}

interface SharedResizeBoundariesProps {

    windows: readonly SharedResizeWindow[]

    begin: (identities: readonly string[]) => ReadonlyMap<string, WindowRegion> | null

    present: (geometries: ReadonlyMap<string, WindowRegion>) => void

    commit: (geometries: ReadonlyMap<string, WindowRegion>) => void

    finish: (identities: readonly string[]) => void

    cancel: (identities: readonly string[]) => void
}

interface ActiveBoundary {

    boundary: SharedResizeBoundary

    delta: number
}
