import { resolveWindowGeometry, type WindowRegion } from "@client/view/components/window-manager/window-geometry"
import { type LocalAnimation } from "@client/view/components/desktop-host/local-window"
import { type AppearanceTransaction, type Position, type Size } from "@phreshos/core"
import { useMotionValue, useTransform, type MotionStyle } from "motion/react"
import { useLayoutEffect, useRef } from "react"
import { WindowGeometryAnimation } from "./window-geometry-animation"
import { useAppearance } from "@phreshos/react-ui"

interface WindowGeometryMotionOptions {
    position: Position
    size: Size
    animation?: LocalAnimation | null
    immediate: boolean
    onComplete?: (revision: number) => void
}

/**
 * One continuous local representation of Window geometry.
 *
 * Core values remain the destination. Motion values exclusively own the
 * visible pixels, including during a pointer gesture, so releasing a drag
 * cannot hand the transform to another renderer before snapping begins.
 */
export default function useWindowGeometryMotion({ position, size, animation, immediate, onComplete }: WindowGeometryMotionOptions) {

    const appearanceTransaction = useAppearance().transaction
    const frame = useRef<HTMLDivElement>(null)
    const x = useMotionValue(typeof position.x === "number" ? position.x : 0)
    const y = useMotionValue(typeof position.y === "number" ? position.y : 0)
    const width = useMotionValue(typeof size.width === "number" ? size.width : 0)
    const height = useMotionValue(typeof size.height === "number" ? size.height : 0)
    const layoutWidth = useMotionValue(width.get())
    const layoutHeight = useMotionValue(height.get())
    const scaleX = useTransform(() => layoutWidth.get() === 0 ? 1 : width.get() / layoutWidth.get())
    const scaleY = useTransform(() => layoutHeight.get() === 0 ? 1 : height.get() / layoutHeight.get())
    const animator = useRef<WindowGeometryAnimation | null>(null)
    if (!animator.current) animator.current = new WindowGeometryAnimation({ x, y, width, height }, { width: layoutWidth, height: layoutHeight })
    const gesturing = useRef(false)
    const initialized = useRef(false)
    const values = useRef({ position, size, animation, immediate, onComplete })

    values.current = { position, size, animation, immediate, onComplete }

    function read(): WindowRegion {

        return { x: x.get(), y: y.get(), width: width.get(), height: height.get() }
    }

    function stop() {

        animator.current!.stop()
    }

    function set(region: WindowRegion) {

        animator.current!.set(region)
    }

    function transition(region: WindowRegion, transaction: AppearanceTransaction = appearanceTransaction, complete?: () => void) {

        if (immediate) {

            set(region)
            complete?.()

            return
        }

        animator.current!.transition(region, transaction, complete)
    }

    function resolve() {

        const parent = frame.current?.offsetParent

        return parent ? resolveWindowGeometry(values.current.position, values.current.size, parent.getBoundingClientRect()) : null
    }

    useLayoutEffect(function () {

        const region = resolve()

        if (!region || gesturing.current) return

        const revision = animation?.revision

        if (!initialized.current) {

            initialized.current = true
            set(region)

            if (revision !== undefined) onComplete?.(revision)

            return
        }

        transition(region, animation?.transaction, revision === undefined ? undefined : () => onComplete?.(revision))

    }, [position.x, position.y, size.width, size.height, animation?.revision, immediate])

    useLayoutEffect(function () {

        const parent = frame.current?.offsetParent

        if (!parent) return

        let bounds = parent.getBoundingClientRect()

        const observer = new ResizeObserver(function () {

            const next = parent.getBoundingClientRect()

            if (next.width === bounds.width && next.height === bounds.height) return

            bounds = next

            if (gesturing.current) return

            const region = resolve()

            if (region) set(region)
        })

        observer.observe(parent)

        return () => observer.disconnect()

    }, [])

    useLayoutEffect(() => stop, [])

    function beginGesture() {

        const parent = frame.current?.offsetParent

        if (!parent) return null

        gesturing.current = true
        stop()

        return { bounds: parent.getBoundingClientRect(), region: read() }
    }

    function updateGesture(region: WindowRegion) {

        set(region)
    }

    function finishGesture(region?: WindowRegion) {

        gesturing.current = false

        if (region) transition(region)
    }

    function cancelGesture() {

        gesturing.current = false

        const region = resolve()

        if (region) set(region)
    }

    return {
        frame,
        style: { x, y, width: layoutWidth, height: layoutHeight, scaleX, scaleY, transformOrigin: "0 0" } satisfies MotionStyle,
        read,
        beginGesture,
        updateGesture,
        finishGesture,
        cancelGesture
    }
}
