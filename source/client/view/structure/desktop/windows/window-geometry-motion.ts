import { constrainWindowGeometry, resolveWindowGeometry, type WindowRegion, type WindowSurfaceSize } from "@client/view/components/window-manager/window-geometry"
import { type PresentationAnimation } from "@client/view/components/desktop-host/presentation"
import { resolveWindowTransaction } from "@client/view/appearance/motion"
import { type AppearanceTransaction, type Position, type Size, type PresentationTransaction } from "@phreshos/core"
import { useMotionValue, useTransform, type MotionStyle } from "motion/react"
import { useLayoutEffect, useRef } from "react"
import { WindowGeometryAnimation } from "./window-geometry-animation"
import motionAcross, { travel } from "../motion-across"
import { useAppearance } from "@phreshos/react-ui"

interface WindowGeometryMotionOptions {
    position: Position
    size: Size
    animation?: PresentationAnimation | null
    transaction?: PresentationTransaction | null
    immediate: boolean
    /**
     * A standard Window, which the Desktop moves itself: its motions are chosen from how far it
     * goes, not taken from the Appearance timing. A raw drawing keeps the timing its Program asked.
     */
    standard?: boolean
    /** Moves visibly only when the person can see where it starts or where it ends; otherwise it is simply there. */
    seenOnly?: boolean
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
export default function useWindowGeometryMotion({ position, size, animation, transaction, immediate, standard = false, seenOnly = false, minimumSize, onComplete }: WindowGeometryMotionOptions) {

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
    const values = useRef({ position, size, animation, transaction, immediate, standard, seenOnly, minimumSize, onComplete })

    values.current = { position, size, animation, transaction, immediate, standard, seenOnly, minimumSize, onComplete }

    function read(): WindowRegion {

        return { x: x.get(), y: y.get(), width: width.get(), height: height.get() }
    }

    /** Hears every step of the box's position: at rest, along a motion, and with the pointer. */
    function watch(listener: () => void) {

        const stopX = x.on("change", listener)
        const stopY = y.on("change", listener)

        return () => {
            stopX()
            stopY()
        }
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

    /**
     * The motion to a place when none was asked for: a standard Window's comes from how far it goes,
     * and from whether it leaves the person's sight on the way.
     */
    function timingTo(region: WindowRegion) {

        if (!values.current.standard) return appearanceTransaction

        const from = read()

        return motionAcross(travel(from, region), "window", seen(from) && !seen(region))
    }

    function transition(region: WindowRegion, transaction: AppearanceTransaction = timingTo(region), complete?: () => void) {

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

    /** Whether a box on the plane touches the screen. */
    function seen(shown: WindowRegion) {

        const parent = frame.current?.parentElement

        if (!parent) return false

        const surface = logicalSize(parent)

        return shown.x < surface.width && shown.x + shown.width > 0 && shown.y < surface.height && shown.y + shown.height > 0
    }

    /** Whether the person can see where the box is now or where it is going. */
    function seenAtAnEnd(region: WindowRegion) {

        return seen(read()) || seen(region)
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
            ? animation.transaction === undefined ? timingTo(region) : resolveWindowTransaction(animation.transaction, appearanceTransaction)
            : transaction === undefined || transaction === null
                ? null
                : resolveWindowTransaction(transaction, appearanceTransaction)

        // A motion shows where something went or where it came from; between two places the person
        // does not see, there is nothing to show, and a path across the screen would only distract.
        if (!selected || (values.current.seenOnly && !seenAtAnEnd(region))) {
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

    useLayoutEffect(() => () => { stopChase(); stop() }, [])

    function beginGesture() {

        const parent = frame.current?.parentElement

        if (!parent) return null

        completeGestureRestore()
        gesturing.current = true
        const revision = ++gestureRevision.current
        stopChase()
        stop()

        const physical = parent.getBoundingClientRect()

        return {
            bounds: { left: physical.left, top: physical.top, ...logicalSize(parent) },
            region: read(),
            revision
        }
    }

    // A dragged box does not jump to each pointer event: it chases the pointer's place each frame,
    // which melts the hand's small jolts and keeps its intent.
    const chase = useRef<{ target: WindowRegion, frame: number, last: number } | null>(null)

    function stopChase() {

        if (chase.current?.frame) cancelAnimationFrame(chase.current.frame)

        chase.current = null
    }

    function follow(time: number) {

        const state = chase.current

        if (!state) return

        const step = state.last ? Math.min(time - state.last, 64) : 16

        state.last = time

        const share = values.current.immediate ? 1 : 1 - Math.exp(-step / 16)

        const shown = read()

        const next = {
            x: shown.x + (state.target.x - shown.x) * share,
            y: shown.y + (state.target.y - shown.y) * share,
            width: shown.width + (state.target.width - shown.width) * share,
            height: shown.height + (state.target.height - shown.height) * share
        }

        if (restoringGesture.current) animator.current!.setPosition(next)

        else set(next)

        const near = Math.abs(state.target.x - next.x) < 0.5 && Math.abs(state.target.y - next.y) < 0.5 && Math.abs(state.target.width - next.width) < 0.5 && Math.abs(state.target.height - next.height) < 0.5

        if (near) {

            if (restoringGesture.current) animator.current!.setPosition(state.target)

            else set(state.target)

            state.frame = 0

            return
        }

        state.frame = requestAnimationFrame(follow)
    }

    function updateGesture(region: WindowRegion) {

        if (!chase.current) chase.current = { target: region, frame: 0, last: 0 }

        chase.current.target = region

        if (!chase.current.frame) chase.current.frame = requestAnimationFrame(follow)
    }

    function restoreGesture(region: WindowRegion) {

        const shown = read()
        const scaleX = region.width === 0 ? 1 : shown.width / region.width
        const scaleY = region.height === 0 ? 1 : shown.height / region.height
        const originX = scaleX === 1 ? 0 : (shown.x - region.x) / (1 - scaleX)
        const originY = scaleY === 1 ? 0 : (shown.y - region.y) / (1 - scaleY)

        restoringGesture.current = true
        transformOrigin.set(`${originX}px ${originY}px`)
        animator.current!.transitionSize(region, values.current.standard ? motionAcross(Math.hypot(region.width - shown.width, region.height - shown.height), "window") : appearanceTransaction, () => {

            completeGestureRestore()
        })
    }

    function targetGesture(revision: number, region: WindowRegion) {

        if (gestureRevision.current !== revision) return false

        stopChase()

        completeGestureRestore()
        transition(region)

        return true
    }

    function settleGesture(revision: number) {

        if (gestureRevision.current !== revision) return false

        stopChase()

        // The authoritative request has now settled. The visible values
        // already express its result, so ownership can change without
        // retargeting Motion through an earlier server snapshot.
        gesturing.current = false

        return true
    }

    function finishGesture(region?: WindowRegion, revision = gestureRevision.current) {

        if (gestureRevision.current !== revision) return false

        stopChase()

        gesturing.current = false

        if (region) {

            completeGestureRestore()
            transition(region)
        }

        return true
    }

    function cancelGesture(revision = gestureRevision.current) {

        if (gestureRevision.current !== revision) return false

        stopChase()

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
        watch,
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
