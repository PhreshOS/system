import { type CSSProperties, useLayoutEffect, useRef } from "react"
import { animate } from "motion"
import { motionDuration, motionDurations, motionEase } from "../../../appearance/motion"
import { resolveWindowGeometry, resolveWindowValue, windowPaintInsets, type WindowSurfaceSize } from "../../../components/window-manager/window-geometry"
import { windowPaintInset } from "../geometry"
import { type Position, type Size } from "@phreshos/core"
import { Surface } from "@phreshos/react-ui"

/** Animated preview of the placement currently offered by a drag. */
export default function SnapPreview({ shown, visible, bare, paintSurfaceSize, radius, reducedMotion, zIndex }: SnapPreviewProps) {

    const element = useRef<HTMLDivElement>(null)
    const firstRender = useRef(true)
    const initial = useRef(shown)

    useLayoutEffect(function () {

        const preview = element.current
        const parent = preview?.offsetParent

        if (!preview || !parent) return

        const parentBounds = parent.getBoundingClientRect()
        const currentBounds = preview.getBoundingClientRect()
        const current = {
            x: currentBounds.left - parentBounds.left,
            y: currentBounds.top - parentBounds.top,
            width: currentBounds.width,
            height: currentBounds.height
        }
        const target = resolveWindowGeometry(shown.position, shown.size, parentBounds)
        const fromOpacity = firstRender.current ? 0 : Number(getComputedStyle(preview).opacity)

        firstRender.current = false

        if (reducedMotion) {

            setPreview(preview, target, visible ? 1 : 0)

            return
        }

        const animation = animate(preview, {
            left: [current.x, target.x],
            top: [current.y, target.y],
            width: [current.width, target.width],
            height: [current.height, target.height],
            opacity: [fromOpacity, visible ? 1 : 0]
        }, {
            duration: motionDuration(motionDurations.snap),
            ease: motionEase([0.33, 1, 0.68, 1])
        })

        return () => { animation.stop() }

    }, [shown.position.x, shown.position.y, shown.size.width, shown.size.height, visible, reducedMotion])

    return <div
        ref={element}
        className="pointer-events-none absolute"
        style={{
            left: resolveWindowValue(initial.current.position.x),
            top: resolveWindowValue(initial.current.position.y),
            width: resolveWindowValue(initial.current.size.width),
            height: resolveWindowValue(initial.current.size.height),
            opacity: 0,
            zIndex
        }}
    >
        <Surface
            data-snap-preview-frame
            opacity="xsmall"
            className={`absolute ${bare ? "inset-0" : ""}`}
            style={bare ? undefined : { ...windowPaintInsets(shown.position, shown.size, paintSurfaceSize, windowPaintInset), borderRadius: radius }}
        />
    </div>
}

function setPreview(element: HTMLElement, region: ReturnType<typeof resolveWindowGeometry>, opacity: number) {
    element.style.left = `${region.x}px`
    element.style.top = `${region.y}px`
    element.style.width = `${region.width}px`
    element.style.height = `${region.height}px`
    element.style.opacity = String(opacity)
}

export interface SnapTarget {
    position: Position
    size: Size
}

interface SnapPreviewProps {
    shown: SnapTarget
    visible: boolean
    bare: boolean
    paintSurfaceSize: WindowSurfaceSize
    radius: number
    reducedMotion: boolean
    zIndex: CSSProperties["zIndex"]
}
