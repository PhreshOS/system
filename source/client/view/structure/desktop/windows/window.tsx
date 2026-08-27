import { ComponentProps, PointerEvent as ReactPointerEvent, ReactNode, useLayoutEffect, useRef, useState } from "react"
import { useReducedMotion } from "@libs/react-motion"
import { enterSurface, prepareSurfaceEntrance, restSurface } from "../../../appearance/surface-presence"
import { Surface, useTheme } from "@phreshos/react-ui"
import { absoluteWindowGeometry, resolveWindowGeometry, resolveWindowValue, wholeWindowGeometry, windowPaintInsets, type WindowRegion, type WindowSurfaceSize } from "../../../components/window-manager/window-geometry"
import { numericScale, type Position, type Size, type WindowGeometry } from "@phreshos/core"
import WindowHeader from "./window-header"
import WindowSurface from "./window-surface"
import { type LocalAnimation, type LocalSurfaceState } from "../../../components/desktop-host/local-window"
import { type LocalGeometryReader } from "../../../components/window-manager/local-windows"
import gsap, { motionDuration, motionEase } from "../../../appearance/motion"
import SnapPreview, { type SnapTarget } from "./snap-preview"
import { windowPaintInset } from "../geometry"

/**
 * A window: a pure function of the record it is given. Every render
 * declares the whole target geometry from props — a float as left/top
 * pixels, a tile as its relative form. GSAP interpolates only the local
 * representation between targets; the record remains the truth and a
 * refreshed page renders that truth directly.
 *
 * A gesture is state, not a side channel: while one runs, the render
 * derives from the gesture's rectangle instead of the record — movement
 * rides a transform above the grabbed origin, interpolation pauses — and
 * release reports the outcome (onMove or onResize with resting pixels —
 * a resize carrying an origin only when the edge dragged moved one —
 * onSnap with the shares a zone names) and drops the gesture in the same
 * batch the record updates, so nothing jumps.
 *
 * GSAP owns every structural interpolation: frame geometry, local Surface
 * replacement, and the scale and drift of presence. It never owns state.
 *
 * The chrome uses the shared system material and content sits on an inset
 * sheet. The close control requests — the window leaves only when the truth
 * drops its process.
 */
const edges: { edge: WindowEdge, className: string }[] = [

    { edge: "n", className: "inset-x-4 top-0 h-2 cursor-ns-resize" },
    { edge: "s", className: "inset-x-4 bottom-0 h-2 cursor-ns-resize" },
    { edge: "w", className: "inset-y-4 left-0 w-2 cursor-ew-resize" },
    { edge: "e", className: "inset-y-4 right-0 w-2 cursor-ew-resize" },
    { edge: "nw", className: "top-0 left-0 size-4 cursor-nwse-resize" },
    { edge: "ne", className: "top-0 right-0 size-4 cursor-nesw-resize" },
    { edge: "sw", className: "bottom-0 left-0 size-4 cursor-nesw-resize" },
    { edge: "se", className: "bottom-0 right-0 size-4 cursor-nwse-resize" }
]

export default function ({ title, icon, children, onClose, onClosed, onMinimize, onMaximize, onActivate, onUnavailable, onMove, onResize, onSnap, onLocalAnimationComplete, onLocalRepresentation, onFocusCapture, active = false, bare = false, closing = false, stopping = false, minimized = false, animateEntrance = true, position = { x: 0, y: 0 }, size = { width: 520, height: 340 }, localSurface, geometryAnimation, paintSurfaceSize = { width: 0, height: 0 }, minWidth = 260, minHeight = 160, className, style, ...props }: WindowProps) {

    const frame = useRef<HTMLDivElement>(null)

    const surfaceElement = useRef<HTMLDivElement>(null)

    const reducedMotion = useReducedMotion()

    const theme = useTheme()

    const radius = numericScale(theme.radius)

    const outerRadius = radius.large

    const innerRadius = radius.medium

    const [gesture, setGesture] = useState<Gesture | null>(null)

    const [renderedGeometry, setRenderedGeometry] = useState<WindowGeometry>({ position, size })

    const [renderedActive, setRenderedActive] = useState(active)

    const morphStart = useRef<WindowRegion | null>(null)

    const morphRevision = useRef(0)

    useLayoutEffect(function () {

        if (!onLocalRepresentation) return

        const read: LocalGeometryReader = function () {

            const element = frame.current

            const parent = element?.offsetParent

            if (!element || !parent) return { position, size }

            const shown = element.getBoundingClientRect()

            const surface = parent.getBoundingClientRect()

            return {
                position: { x: shown.left - surface.left, y: shown.top - surface.top },
                size: { width: shown.width, height: shown.height }
            }
        }

        onLocalRepresentation(read)

        return () => onLocalRepresentation(null)

    }, [onLocalRepresentation, position, size])

    useLayoutEffect(function () {

        const element = frame.current

        const parent = element?.offsetParent

        if (!element || !parent || gesture) return

        if (sameGeometry(renderedGeometry, { position, size })) {

            if (geometryAnimation) onLocalAnimationComplete?.("geometry", geometryAnimation.revision)

            return
        }

        const parentBounds = parent.getBoundingClientRect()
        const shown = element.getBoundingClientRect()
        const current = {
            x: shown.left - parentBounds.left,
            y: shown.top - parentBounds.top,
            width: shown.width,
            height: shown.height
        }
        const target = resolveWindowGeometry(position, size, parentBounds)
        const transaction = geometryAnimation?.transaction
        const duration = transaction?.duration ?? 300

        gsap.killTweensOf(element)

        const complete = function () {

            setRenderedGeometry({ position, size })

            if (geometryAnimation) onLocalAnimationComplete?.("geometry", geometryAnimation.revision)
        }

        if (bare || reducedMotion || duration === 0 || sameRegion(current, target)) {

            gsap.set(element, { left: target.x, top: target.y, width: target.width, height: target.height, transform: "none" })
            complete()

            return
        }

        const animation = gsap.fromTo(element, {
            left: current.x,
            top: current.y,
            width: current.width,
            height: current.height,
            transform: "none"
        }, {
            left: target.x,
            top: target.y,
            width: target.width,
            height: target.height,
            transform: "none",
            duration: motionDuration(duration),
            ease: transaction ? motionEase(transaction.easing) : motionEase([0.65, 0, 0.35, 1]),
            overwrite: "auto",
            onComplete: complete
        })

        return function () {

            const held = element.getBoundingClientRect()
            const bounds = parent.getBoundingClientRect()

            animation.kill()

            gsap.set(element, {
                left: held.left - bounds.left,
                top: held.top - bounds.top,
                width: held.width,
                height: held.height,
                transform: "none"
            })
        }

    }, [position.x, position.y, size.width, size.height, geometryAnimation?.revision, reducedMotion, bare, gesture !== null])

    useLayoutEffect(function () {

        const element = frame.current
        const from = morphStart.current

        if (!element || !from || gesture?.morph == null || reducedMotion) return

        const animation = gsap.fromTo(element, {
            left: from.x,
            top: from.y,
            width: from.width,
            height: from.height
        }, {
            left: gesture.origin.x,
            top: gesture.origin.y,
            width: gesture.current.width,
            height: gesture.current.height,
            duration: 0.22,
            ease: motionEase([0.33, 1, 0.68, 1]),
            overwrite: "auto"
        })

        return () => { animation.kill() }

    }, [gesture?.morph, reducedMotion])

    useLayoutEffect(function () {

        const element = surfaceElement.current

        if (!element || renderedActive === active) return

        const property = active ? "--shadow-window-active" : "--shadow-window-inactive"
        const target = getComputedStyle(element).getPropertyValue(property).trim() || "none"

        gsap.killTweensOf(element, "boxShadow")

        if (reducedMotion) {

            gsap.set(element, { boxShadow: target })
            setRenderedActive(active)

            return
        }

        const animation = gsap.to(element, {
            boxShadow: target,
            duration: 0.2,
            ease: motionEase("ease-out"),
            overwrite: "auto",
            onComplete: () => setRenderedActive(active)
        })

        return () => { animation.kill() }

    }, [active, reducedMotion, renderedActive])

    const closureCompleted = useRef(false)

    function completeClosure() {

        if (closureCompleted.current) return

        closureCompleted.current = true

        onClosed?.()
    }

    // A window is absolute when none of its expressions depends on the surface.
    const absolute = absoluteWindowGeometry(position, size)

    // Whether it is filling the surface — read off the geometry, for
    // this button's own label and nothing else. The system has no such
    // state any more: filling the surface is a size like any other, and
    // this is the interface recognising a size it offered to set.
    const whole = wholeWindowGeometry(position, size)

    // Presence: a newly created window enters, while a window inherited
    // when its desktop mounts is already here and renders at rest. A full
    // page refresh remounts elements, not processes, and must not make all
    // restored windows look newly opened.
    //
    // Bare, there is no entrance. Motion is a visual effect like the
    // surface and the shadow, and `under` and `over` are the layers where
    // the system paints nothing — so what would scale and drift here is
    // the program's own content, which reads as the program stumbling
    // rather than as a window opening. It showed on every refresh,
    // because a refresh mounts every window and a mount is a birth.
    useLayoutEffect(function () {

        if (bare) return

        if (minimized) {

            gsap.set(surfaceElement.current, { scale: reducedMotion ? 1 : 0.86, y: reducedMotion ? 0 : 28, visibility: "hidden" })

            return
        }

        if (!animateEntrance) {

            restSurface(surfaceElement.current)

            gsap.set(surfaceElement.current, { visibility: "visible" })

            return
        }

        prepareSurfaceEntrance(surfaceElement.current, reducedMotion)

        gsap.set(surfaceElement.current, { visibility: "visible" })

        const animation = enterSurface(surfaceElement.current, reducedMotion)

        return () => { animation?.kill() }

        // Presence at birth reads the mount's own values once.
    }, [])

    // A preference change takes effect immediately. Any automatic travel
    // already in progress is ended at its truthful final representation;
    // closing still answers its completion handshake.
    useLayoutEffect(function () {

        if (!surfaceElement.current) return

        // A hidden window can silently prepare the pose that a future
        // restore will animate from if the preference has been relaxed.
        if (!reducedMotion) {

            if (minimized) gsap.set(surfaceElement.current, { scale: 0.86, y: 28, visibility: "hidden" })

            return
        }

        gsap.killTweensOf(surfaceElement.current)

        gsap.set(surfaceElement.current, { scale: 1, y: 0, visibility: minimized || closing ? "hidden" : "visible" })

        if (closing) {

            onUnavailable?.("close")

            completeClosure()
        }

        else if (minimized) onUnavailable?.("minimize")

    }, [reducedMotion])

    // Minimising drifts toward the taskbar; restoring rises back.
    const arrived = useRef(false)

    useLayoutEffect(function () {

        if (!arrived.current) {

            arrived.current = true

            return
        }

        if (!surfaceElement.current) return

        if (minimized) onUnavailable?.("minimize")

        // Bare, hiding is hiding: the visibility changes and nothing
        // travels. There is no taskbar for it to drift toward — a
        // program in `under` or `over` is not listed — so the drift
        // would be motion toward nowhere.
        if (bare || reducedMotion) {

            gsap.set(surfaceElement.current, { scale: 1, y: 0, visibility: minimized ? "hidden" : "visible" })

            return
        }

        // Presence is scale and drift, never opacity, so the material and its
        // content remain visually stable throughout the movement. Going away
        // is a departure toward the taskbar; hiding happens only at the end.
        if (!minimized) gsap.set(surfaceElement.current, { visibility: "visible" })

        const animation = minimized

            ? gsap.to(surfaceElement.current, { scale: 0.86, y: 28, duration: 0.11, ease: "power3.in", onComplete: () => gsap.set(surfaceElement.current, { visibility: "hidden" }) })

            : gsap.to(surfaceElement.current, { scale: 1, y: 0, duration: 0.24, ease: "power3.out" })

        return () => { animation.kill() }

    }, [minimized])

    // Closing is a handshake: the exit plays, onClosed reports the
    // element may be unmounted.
    useLayoutEffect(function () {

        if (!closing || !surfaceElement.current) return

        onUnavailable?.("close")

        // Bare, there is no exit to play — but the handshake still has
        // to be answered, or the desktop keeps the leaving record
        // forever waiting for an animation that never runs.
        if (bare || reducedMotion) {

            completeClosure()

            return
        }

        const animation = gsap.to(surfaceElement.current, { scale: 0.86, y: 12, duration: 0.16, ease: "power2.in", onComplete: completeClosure })

        return () => { animation.kill() }

    }, [closing])

    function grab(event: ReactPointerEvent<HTMLElement>, edge: WindowEdge | null) {

        // A cancelled pointerdown suppresses double-click synthesis, and
        // a shared window restores by double-click; absolute ones keep
        // it to block native drags.
        if (absolute) event.preventDefault()

        const handle = event.currentTarget

        handle.setPointerCapture(event.pointerId)

        const parent = frame.current?.offsetParent

        const bounds = parent?.getBoundingClientRect()

        if (!frame.current || !parent || !bounds) return

        // The grabbed origin is measured, not assumed: grabbing a window
        // mid-transition holds it exactly where the eye sees it.
        const rect = frame.current.getBoundingClientRect()

        let origin: WindowRegion = { x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height }

        let current: WindowRegion = { ...origin }

        gsap.killTweensOf(frame.current)

        gsap.set(frame.current, { left: origin.x, top: origin.y, width: origin.width, height: origin.height, transform: "none" })

        setRenderedGeometry({
            position: { x: origin.x, y: origin.y },
            size: { width: origin.width, height: origin.height }
        })

        if (geometryAnimation) onLocalAnimationComplete?.("geometry", geometryAnimation.revision)

        // Pulling a shared window out of its placement belongs to the
        // header alone. An edge is not a hand asking to float — it is a
        // hand asking for a different size, and a window keeps whatever
        // of its placement that edge does not touch.
        let restoring = !absolute && edge === null

        let moved = false

        let morph: number | null = null

        let zone: Snap | null = null

        let shown: Snap | null = null

        let renderFrame = 0

        const start = { pointerX: event.clientX, pointerY: event.clientY }

        // Pointer hardware can report faster than the display can paint. Keep
        // gesture state authoritative while scheduling at most one React
        // update for each visual frame.
        function renderGesture() {

            if (renderFrame) return

            renderFrame = requestAnimationFrame(function () {

                renderFrame = 0

                setGesture({ origin, current, zone, shown, morph })
            })
        }

        // Zones are where the pointer is — within 16px of an edge — and
        // they name shares of the surface, which each client resolves in
        // its own space.
        function snapTerm(motion: globalThis.PointerEvent): Snap | null {

            const pointerX = motion.clientX - bounds!.left

            const pointerY = motion.clientY - bounds!.top

            const west = pointerX <= 16

            const east = pointerX >= bounds!.width - 16

            const north = pointerY <= 16

            const south = pointerY >= bounds!.height - 16

            if (!west && !east && !north && !south) return null

            return {

                position: { x: east ? "1/2" : "0/1", y: south ? "1/2" : "0/1" },

                size: { width: west || east ? "1/2" : "1/1", height: north || south ? "1/2" : "1/1" }
            }
        }

        function move(motion: globalThis.PointerEvent) {

            const dx = motion.clientX - start.pointerX

            const dy = motion.clientY - start.pointerY

            // A click is not a drag: without this, releasing a stationary
            // press inside a snap zone would snap the window.
            if (Math.hypot(dx, dy) >= 4) moved = true

            if (restoring) {

                if (Math.hypot(dx, dy) < 8) return

                restoring = false

                // The window returns to its floating size placed so the
                // pointer keeps its proportional position across the
                // header, and the same gesture carries on dragging.
                const pointerX = motion.clientX - bounds!.left

                const pointerY = motion.clientY - bounds!.top

                const ratio = Math.min(Math.max((pointerX - origin.x) / origin.width, 0), 1)

                origin = { x: pointerX - origin.width * ratio, y: pointerY - Math.min(Math.max(pointerY - origin.y, 0), 40), width: origin.width, height: origin.height }

                current = { ...origin }

                start.pointerX = motion.clientX

                start.pointerY = motion.clientY

                onMove?.(origin.x, origin.y)

                // The shrink to floating size glides while the pointer
                // stays live: a brief morph phase transitions the body,
                // never the transform — and it must survive the moves
                // that arrive while it plays.
                morphStart.current = { ...current }

                morph = reducedMotion ? null : ++morphRevision.current

                if (morph !== null) setTimeout(() => {

                    morph = null

                    setGesture(active => active && { ...active, morph: null })

                }, 220)

                setGesture({ origin, current, zone, shown, morph })

                return
            }

            if (edge === null) {

                current = { ...origin, x: origin.x + dx, y: origin.y + dy }

                zone = moved ? snapTerm(motion) : null

                if (zone) shown = zone
            }

            else {

                current = { ...current }

                if (edge.includes("e")) current.width = Math.max(minWidth, origin.width + dx)

                if (edge.includes("s")) current.height = Math.max(minHeight, origin.height + dy)

                // West and north move the origin as well as the size; the
                // clamped size keeps the far edge still at the minimum.
                if (edge.includes("w")) {

                    current.width = Math.max(minWidth, origin.width - dx)

                    current.x = origin.x + origin.width - current.width
                }

                if (edge.includes("n")) {

                    current.height = Math.max(minHeight, origin.height - dy)

                    current.y = origin.y + origin.height - current.height
                }
            }

            renderGesture()
        }

        function release(motion: globalThis.PointerEvent) {

            if (renderFrame) cancelAnimationFrame(renderFrame)

            handle.removeEventListener("pointermove", move)

            handle.removeEventListener("pointerup", release)

            handle.removeEventListener("pointercancel", release)

            // A tiled press that never crossed the threshold changed
            // nothing: the render returns to the tile it never left.
            if (restoring) {

                setGesture(null)

                return
            }

            const term = moved && edge === null && motion.type === "pointerup" ? snapTerm(motion) : null

            // The outcome and the gesture's end land in one batch: the
            // record updates as the gesture stops overriding it, so the
            // frame never shows a stale in-between.
            if (term) onSnap?.(term.position, term.size)

            else if (moved && motion.type === "pointerup") {

                if (edge === null) onMove?.(current.x, current.y)

                // Only the west and north edges move the origin. A drag
                // on any other reports no position, because none was
                // chosen — and a position nobody chose would replace a
                // share with the pixels it happened to resolve to.
                else onResize?.(current.width, current.height, current.x === origin.x && current.y === origin.y ? null : { x: current.x, y: current.y })

            }

            if (moved && motion.type === "pointerup") {

                setRenderedGeometry({
                    position: { x: current.x, y: current.y },
                    size: { width: current.width, height: current.height }
                })
            }

            else if (motion.type === "pointercancel") setRenderedGeometry({ position, size })

            setGesture(null)
        }

        handle.addEventListener("pointermove", move)

        handle.addEventListener("pointerup", release)

        handle.addEventListener("pointercancel", release)

        setGesture({ origin, current, zone, shown, morph: null })
    }

    // ------------------------------------------------------------ render

    // The geometry, declared whole every render: the gesture's rectangle
    // while one runs — movement as a transform above the grabbed origin,
    // otherwise the last settled representation. GSAP moves that stable
    // representation to each new authoritative target.
    const geometry = gesture

        ? { left: gesture.origin.x, top: gesture.origin.y, width: gesture.current.width, height: gesture.current.height, transform: `translate(${gesture.current.x - gesture.origin.x}px, ${gesture.current.y - gesture.origin.y}px)` }

        : {

            left: resolveWindowValue(renderedGeometry.position.x),

            top: resolveWindowValue(renderedGeometry.position.y),

            width: resolveWindowValue(renderedGeometry.size.width),

            height: resolveWindowValue(renderedGeometry.size.height),

            transform: "none"
        }

    const surface = renderedActive

        ? "shadow-window-active"

        : "shadow-window-inactive"

    const paintedInsets = windowPaintInsets(position, size, paintSurfaceSize, windowPaintInset, gesture?.current)

    return <>

        {/* The snap preview and its result resolve the same edge contacts. */}
        {gesture?.shown && <SnapPreview
            shown={gesture.shown}
            visible={gesture.zone !== null}
            bare={bare}
            paintSurfaceSize={paintSurfaceSize}
            radius={outerRadius}
            reducedMotion={reducedMotion}
            zIndex={style?.zIndex}
        />}

        <div

            ref={frame}

            onPointerDown={onActivate}

            // DOM focus and desktop focus are one fact. Tabbing into a
            // background window therefore raises the same window a press
            // would; the keyboard does not maintain a second selection.
            onFocusCapture={event => {

                if (!active && !minimized && !closing) onActivate?.()

                onFocusCapture?.(event)
            }}

            className={`absolute ${minimized || closing ? "pointer-events-none" : "pointer-events-auto"} ${className ?? ""}`}

            style={{ ...geometry, ...style }}

            {...props}

            // A hidden pane is absent from sequential focus as well as
            // pointer hit-testing. Visibility currently provides the same
            // effect visually; inert states the interaction rule directly.
            inert={minimized || closing}

        >

            {/* The painted frame, inset inside the box. The box is where
                the window *is*; this is what a person sees of it, and the
                difference between them is the gap.

                Bare, there is no difference: the frame fills the box, so
                the window is exactly as large as it asked to be and its
                boundaries are the ones its own content draws. */}
            <div data-window-container ref={surfaceElement} style={bare ? undefined : { ...paintedInsets, borderRadius: outerRadius, color: theme.foreground }} className={`absolute isolate grid ${bare ? "inset-0 grid-rows-1" : `overflow-hidden grid-rows-[auto_minmax(0,1fr)] ${surface}`}`}>

                {/* Material is paint, not the interaction container. Keeping
                    it as a sibling behind the window contents prevents plain
                    overlays such as the inactive-window click catcher from
                    entering the Surface tree or receiving its effects. */}
                {!bare && <Surface

                    data-window-frame-surface

                    aria-hidden="true"

                    className="pointer-events-none absolute inset-0 -z-1 rounded-[inherit]"

                />}

                {/* A bare Client controls its own host surface. It remains a
                    sibling behind the frame, with its own radius and no
                    clipping parent. */}
                {bare && localSurface && <WindowSurface state={localSurface} onComplete={revision => onLocalAnimationComplete?.("surface", revision)} />}

                {!bare && <WindowHeader

                    title={title}

                    icon={icon}

                    active={active}

                    whole={whole}

                    reducedMotion={reducedMotion}

                    onGrab={event => grab(event, null)}

                    onMinimize={onMinimize}

                    onMaximize={onMaximize}

                    onClose={onClose}

                    stopping={stopping || closing}

                />}

                {/* Where the program is. Bare, it is the whole of the
                    box and wears none of the system's own edges. */}
                <div data-window-content style={bare ? undefined : { borderRadius: innerRadius }} className={bare ? "relative min-h-0" : "relative m-1.5 mt-0 min-h-0 overflow-hidden bg-white/25 shadow-window-content"}>

                    {children}

                </div>

            </div>

            {!bare && edges.map(handle => <div

                key={handle.edge}

                onPointerDown={event => grab(event, handle.edge)}

                className={`absolute touch-none ${handle.className}`}

            />)}

        </div>

    </>
}

type WindowEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

type Snap = SnapTarget

interface WindowProps extends Omit<ComponentProps<"div">, "title"> {

    title?: ReactNode

    // Drawn beside the title. A URL rather than a node: what a window
    // shows of its program is a picture the browser fetches, and the
    // path it fetches from is the view's to build.
    icon: string

    onClose?: () => void

    onClosed?: () => void

    onMinimize?: () => void

    onMaximize?: () => void

    onActivate?: () => void

    /** The window is leaving interaction; its composition chooses new focus. */
    onUnavailable?: (reason: "minimize" | "close") => void

    onMove?: (x: number, y: number) => void

    onResize?: (width: number, height: number, position: { x: number, y: number } | null) => void

    onSnap?: (position: Position, size: Size) => void

    active?: boolean

    // Nothing the system paints. The window's boundaries become the
    // frame's exactly: no surface, no shadow, no rounding, no header, no
    // controls, and no gutter — so what a program asked to be is what it
    // gets, edge to edge, rather than half a gutter smaller.
    //
    // The endpoint owns later local projection in a bare layer, so the
    // ordinary window manager contributes neither resize edges nor snapping.
    bare?: boolean

    closing?: boolean

    /** The Process termination request has not settled yet. */
    stopping?: boolean

    minimized?: boolean

    // Whether mounting this element represents a newly opened window.
    animateEntrance?: boolean

    position?: Position

    size?: Size

    /** Surface target owned by this live iframe representation. */
    localSurface?: LocalSurfaceState | null

    geometryAnimation?: LocalAnimation | null

    onLocalAnimationComplete?: (kind: "geometry" | "surface", revision: number) => void

    onLocalRepresentation?: (reader: LocalGeometryReader | null) => void

    /** Surface used only to decide which painted edges receive an inset. */
    paintSurfaceSize?: WindowSurfaceSize

    minWidth?: number

    minHeight?: number

}

interface Gesture {

    origin: WindowRegion

    current: WindowRegion

    zone: Snap | null

    shown: Snap | null

    morph: number | null
}

function sameGeometry(left: WindowGeometry, right: WindowGeometry) {

    return left.position.x === right.position.x
        && left.position.y === right.position.y
        && left.size.width === right.size.width
        && left.size.height === right.size.height
}

function sameRegion(left: WindowRegion, right: WindowRegion) {

    return Math.abs(left.x - right.x) <= 0.5
        && Math.abs(left.y - right.y) <= 0.5
        && Math.abs(left.width - right.width) <= 0.5
        && Math.abs(left.height - right.height) <= 0.5
}
