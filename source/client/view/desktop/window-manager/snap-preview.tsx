import { type CSSProperties, useLayoutEffect, useRef, useState } from "react"
import gsap, { motionEase } from "../../appearance/motion"
import { resolveWindowGeometry, resolveWindowValue, windowPaintInsets, type WindowSurfaceSize } from "../../components/window-manager/window-geometry"
import { type Position, type Size } from "@phreshos/core"

/** GSAP-owned preview of the placement currently offered by a drag. */
export default function SnapPreview({ shown, visible, bare, paintSurfaceSize, radius, reducedMotion, zIndex }: SnapPreviewProps) {

    const element = useRef<HTMLDivElement>(null)
    const firstRender = useRef(true)
    const [rendered, setRendered] = useState(shown)

    useLayoutEffect(function () {

        const preview = element.current
        const parent = preview?.offsetParent

        if (!preview || !parent) return

        const parentBounds = parent.getBoundingClientRect()
        const shownBounds = preview.getBoundingClientRect()
        const current = {
            x: shownBounds.left - parentBounds.left,
            y: shownBounds.top - parentBounds.top,
            width: shownBounds.width,
            height: shownBounds.height
        }
        const target = resolveWindowGeometry(shown.position, shown.size, parentBounds)
        const fromOpacity = firstRender.current ? 0 : Number(getComputedStyle(preview).opacity)

        firstRender.current = false

        gsap.killTweensOf(preview)

        if (reducedMotion) {

            gsap.set(preview, { left: target.x, top: target.y, width: target.width, height: target.height, opacity: visible ? 1 : 0 })
            setRendered(shown)

            return
        }

        const animation = gsap.fromTo(preview, {
            left: current.x,
            top: current.y,
            width: current.width,
            height: current.height,
            opacity: fromOpacity
        }, {
            left: target.x,
            top: target.y,
            width: target.width,
            height: target.height,
            opacity: visible ? 1 : 0,
            duration: 0.18,
            ease: motionEase([0.33, 1, 0.68, 1]),
            overwrite: "auto",
            onComplete: () => setRendered(shown)
        })

        return () => { animation.kill() }

    }, [shown.position.x, shown.position.y, shown.size.width, shown.size.height, visible, reducedMotion])

    return <div
        ref={element}
        className="pointer-events-none absolute"
        style={{
            left: resolveWindowValue(rendered.position.x),
            top: resolveWindowValue(rendered.position.y),
            width: resolveWindowValue(rendered.size.width),
            height: resolveWindowValue(rendered.size.height),
            opacity: visible ? 1 : 0,
            zIndex
        }}
    >
        <div
            data-snap-preview-frame
            className="absolute border border-white/50 bg-white/25 shadow-snap-preview backdrop-blur-sm"
            style={bare ? { inset: 0 } : { ...windowPaintInsets(shown.position, shown.size, paintSurfaceSize), borderRadius: radius }}
        />
    </div>
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
