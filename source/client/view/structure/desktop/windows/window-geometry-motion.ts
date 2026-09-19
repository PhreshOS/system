import { resolveWindowGeometry, type WindowRegion } from "@client/view/components/window-manager/window-geometry"
import { type PresentationAnimation } from "@client/view/components/desktop-host/window-presentation"
import { resolveWindowTransaction } from "@client/view/appearance/motion"
import { type AppearanceTransaction, type Position, type Size } from "@phreshos/core"
import { useMotionValue, useTransform, type MotionStyle } from "motion/react"
import { useLayoutEffect, useRef } from "react"
import { WindowGeometryAnimation } from "./window-geometry-animation"
import { useAppearance } from "@phreshos/react-ui"

interface WindowGeometryMotionOptions {
    position: Position
    size: Size
    animation?: PresentationAnimation | null
    immediate: boolean
    onComplete?: (revision: number) => void
}

/**
 * One continuous presentation of Window geometry.
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
    const transformOrigin = useMotionValue("0px 0px")
    const scaleX = useTransform(() => layoutWidth.get() === 0 ? 1 : width.get() / layoutWidth.get())
    const scaleY = useTransform(() => layoutHeight.get() === 0 ? 1 : height.get() / layoutHeight.get())
    const animator = useRef<WindowGeometryAnimation | null>(null)
    if (!animator.current) animator.current = new WindowGeometryAnimation({ x, y, width, height }, { width: layoutWidth, height: layoutHeight })
    const gesturing = useRef(false)
    const restoringGesture = useRef(false)
    const initialized = useRef(false)
    const values = useRef({ position, size, animation, immediate, onComplete })

    values.current = { position, size, animation, immediate, onComplete }

    function read(): WindowRegion {

        return { x: x.get(), y: y.get(), width: width.get(), height: height.get() }
    }

    function stop() {

        animator.current!.stop()
    }

    function listen(changed: () => void) {
        let active = true
        let queued = false
        const notify = () => {
            if (queued) return
            queued = true
            queueMicrotask(() => {
                queued = false
                if (active) changed()
            })
        }
        const cleanup = [x, y, width, height].map(value => value.on("change", notify))
        return () => {
            active = false
            for (const release of cleanup) release()
        }
    }

    function completeGestureRestore() {

        if (!restoringGesture.current) return

        restoringGesture.current = false
        transformOrigin.set("0px 0px")
    }

    function set(region: WindowRegion) {

        animator.current!.set(region)
    }

    function present(region: WindowRegion) {

        stop()
        set(region)
    }

    function transition(region: WindowRegion, transaction: AppearanceTransaction = appearanceTransaction, complete?: () => void) {

        if (immediate) {

            set(region)
            complete?.()

            return
        }

        animator.current!.transition(region, transaction, () => {

            completeGestureRestore()
            complete?.()
        })
    }

    function resolve() {

        const parent = frame.current?.parentElement

        return parent ? resolveWindowGeometry(values.current.position, values.current.size, logicalSize(parent)) : null
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

        const selected = animation ? resolveWindowTransaction(animation.transaction, appearanceTransaction) : null

        if (!selected) {
            set(region)
            if (revision !== undefined) onComplete?.(revision)
            return
        }

        transition(region, selected, revision === undefined ? undefined : () => onComplete?.(revision))

    }, [position.x, position.y, size.width, size.height, animation?.revision, immediate])

    useLayoutEffect(function () {

        const parent = frame.current?.parentElement

        if (!parent) return

        let bounds = logicalSize(parent)

        const observer = new ResizeObserver(function () {

            const next = logicalSize(parent)

            if (next.width === bounds.width && next.height === bounds.height) return

            bounds = next

            if (gesturing.current) return

            const region = resolve()

            if (region) {

                set(region)
            }
        })

        observer.observe(parent)

        return () => observer.disconnect()

    }, [])

    useLayoutEffect(() => stop, [])

    function beginGesture() {

        const parent = frame.current?.parentElement

        if (!parent) return null

        completeGestureRestore()
        gesturing.current = true
        stop()

        const physical = parent.getBoundingClientRect()

        return {
            bounds: { left: physical.left, top: physical.top, ...logicalSize(parent) },
            region: read()
        }
    }

    function updateGesture(region: WindowRegion) {

        if (restoringGesture.current) animator.current!.setPosition(region)

        else set(region)
    }

    function restoreGesture(region: WindowRegion) {

        const shown = read()
        const scaleX = region.width === 0 ? 1 : shown.width / region.width
        const scaleY = region.height === 0 ? 1 : shown.height / region.height
        const originX = scaleX === 1 ? 0 : (shown.x - region.x) / (1 - scaleX)
        const originY = scaleY === 1 ? 0 : (shown.y - region.y) / (1 - scaleY)

        restoringGesture.current = true
        transformOrigin.set(`${originX}px ${originY}px`)
        animator.current!.transitionSize(region, appearanceTransaction, () => {

            completeGestureRestore()
        })
    }

    function finishGesture(region?: WindowRegion) {

        gesturing.current = false

        if (region) {

            completeGestureRestore()
            transition(region)
        }
    }

    function cancelGesture() {

        gesturing.current = false
        completeGestureRestore()

        const region = resolve()

        if (region) {

            set(region)
        }
    }

    return {
        frame,
        style: { x, y, width: layoutWidth, height: layoutHeight, scaleX, scaleY, transformOrigin } satisfies MotionStyle,
        read,
        present,
        listen,
        beginGesture,
        updateGesture,
        restoreGesture,
        finishGesture,
        cancelGesture
    }
}

function logicalSize(element: HTMLElement) {
    return { width: element.clientWidth, height: element.clientHeight }
}
