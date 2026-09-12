import { resolveWindowGeometry, type WindowRegion } from "@client/view/components/window-manager/window-geometry"
import { type LocalAnimation } from "@client/view/components/desktop-host/local-window"
import { type AppearanceTransaction, type Position, type Size } from "@phreshos/core"
import { animate, useMotionValue, type AnimationPlaybackControls, type MotionStyle } from "motion/react"
import { useLayoutEffect, useRef } from "react"
import { motionTransition } from "@client/view/appearance/motion"
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
    const controls = useRef<AnimationPlaybackControls[]>([])
    const target = useRef<WindowRegion | null>(null)
    const gesturing = useRef(false)
    const initialized = useRef(false)
    const values = useRef({ position, size, animation, immediate, onComplete })

    values.current = { position, size, animation, immediate, onComplete }

    function read(): WindowRegion {

        return { x: x.get(), y: y.get(), width: width.get(), height: height.get() }
    }

    function stop() {

        for (const control of controls.current) control.stop()

        controls.current = []
    }

    function set(region: WindowRegion) {

        stop()
        target.current = region
        x.set(region.x)
        y.set(region.y)
        width.set(region.width)
        height.set(region.height)
    }

    function transition(region: WindowRegion, transaction: AppearanceTransaction = appearanceTransaction, complete?: () => void) {

        stop()
        target.current = region

        if (immediate || transaction?.duration === 0 || sameRegion(read(), region)) {

            set(region)
            complete?.()

            return
        }

        const options = motionTransition(transaction)

        controls.current = [
            animate(x, region.x, { ...options, onComplete: complete }),
            animate(y, region.y, options),
            animate(width, region.width, options),
            animate(height, region.height, options)
        ]
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

        if (target.current && sameRegion(target.current, region)) return

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
        target.current = null

        return { bounds: parent.getBoundingClientRect(), region: read() }
    }

    function updateGesture(region: WindowRegion) {

        x.set(region.x)
        y.set(region.y)
        width.set(region.width)
        height.set(region.height)
    }

    function finishGesture(region?: WindowRegion) {

        gesturing.current = false

        if (region) transition(region)

        else target.current = read()
    }

    function cancelGesture() {

        gesturing.current = false

        const region = resolve()

        if (region) set(region)
    }

    return {
        frame,
        style: { x, y, width, height } satisfies MotionStyle,
        read,
        beginGesture,
        updateGesture,
        finishGesture,
        cancelGesture
    }
}

function sameRegion(left: WindowRegion, right: WindowRegion) {

    return Math.abs(left.x - right.x) <= 0.5
        && Math.abs(left.y - right.y) <= 0.5
        && Math.abs(left.width - right.width) <= 0.5
        && Math.abs(left.height - right.height) <= 0.5
}
