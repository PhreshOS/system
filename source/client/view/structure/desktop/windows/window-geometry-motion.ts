import { constrainWindowGeometry, resolveWindowGeometry, type WindowRegion, type WindowSurfaceSize } from "@client/view/components/window-manager/window-geometry"
import { type PresentationAnimation } from "@client/view/components/desktop-host/window-presentation"
import { resolveWindowTransaction } from "@client/view/appearance/motion"
import { type AppearanceTransaction, type Position, type Size, type WindowPresentationTransaction } from "@phreshos/core"
import { useMotionValue, useTransform, type MotionStyle } from "motion/react"
import { useLayoutEffect, useRef } from "react"
import { WindowGeometryAnimation } from "./window-geometry-animation"
import { useAppearance } from "@phreshos/react-ui"

interface WindowGeometryMotionOptions {
    position: Position
    size: Size
    animation?: PresentationAnimation | null
    transaction?: WindowPresentationTransaction | null
    immediate: boolean
    minimumSize?: WindowSurfaceSize
    onComplete?: (revision: number) => void
}

/**
 * One continuous presentation of Window geometry.
 *
 * Core values remain the destination. Motion values exclusively own the
 * visible pixels, including during a pointer gesture, so releasing a drag
 * cannot hand the transform to another renderer before snapping begins.
 */
export default function useWindowGeometryMotion({ position, size, animation, transaction, immediate, minimumSize, onComplete }: WindowGeometryMotionOptions) {

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
    const gestureRevision = useRef(0)
    const restoringGesture = useRef(false)
    const initialized = useRef(false)
    const values = useRef({ position, size, animation, transaction, immediate, minimumSize, onComplete })

    values.current = { position, size, animation, transaction, immediate, minimumSize, onComplete }

    function read(): WindowRegion {

        return { x: x.get(), y: y.get(), width: width.get(), height: height.get() }
    }

    function stop() {

        animator.current!.stop()
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

        if (!parent) return null

        const surface = logicalSize(parent)
        const region = resolveWindowGeometry(values.current.position, values.current.size, surface)
        return values.current.minimumSize ? constrainWindowGeometry(region, surface, values.current.minimumSize) : region
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

        const selected = animation
            ? resolveWindowTransaction(animation.transaction, appearanceTransaction)
            : transaction === undefined || transaction === null
                ? null
                : resolveWindowTransaction(transaction, appearanceTransaction)

        if (!selected) {
            set(region)
            if (revision !== undefined) onComplete?.(revision)
            return
        }

        transition(region, selected, revision === undefined ? undefined : () => onComplete?.(revision))

    }, [position.x, position.y, size.width, size.height, animation?.revision, transaction, immediate, minimumSize?.width, minimumSize?.height])

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
        const revision = ++gestureRevision.current
        stop()

        const physical = parent.getBoundingClientRect()

        return {
            bounds: { left: physical.left, top: physical.top, ...logicalSize(parent) },
            region: read(),
            revision
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

    function targetGesture(revision: number, region: WindowRegion) {

        if (gestureRevision.current !== revision) return false

        completeGestureRestore()
        transition(region)

        return true
    }

    function settleGesture(revision: number) {

        if (gestureRevision.current !== revision) return false

        // The authoritative request has now settled. The visible values
        // already express its result, so ownership can change without
        // retargeting Motion through an earlier server snapshot.
        gesturing.current = false

        return true
    }

    function finishGesture(region?: WindowRegion, revision = gestureRevision.current) {

        if (gestureRevision.current !== revision) return false

        gesturing.current = false

        if (region) {

            completeGestureRestore()
            transition(region)
        }

        return true
    }

    function cancelGesture(revision = gestureRevision.current) {

        if (gestureRevision.current !== revision) return false

        gesturing.current = false
        completeGestureRestore()

        const region = resolve()

        if (region) {

            set(region)
        }

        return true
    }

    return {
        frame,
        style: { x, y, width: layoutWidth, height: layoutHeight, scaleX, scaleY, transformOrigin } satisfies MotionStyle,
        read,
        present,
        beginGesture,
        updateGesture,
        restoreGesture,
        targetGesture,
        settleGesture,
        finishGesture,
        cancelGesture
    }
}

function logicalSize(element: HTMLElement) {
    return { width: element.clientWidth, height: element.clientHeight }
}
