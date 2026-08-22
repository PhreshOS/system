import { ComponentProps, PointerEvent as ReactPointerEvent, ReactNode, useLayoutEffect, useRef, useState } from "react"
import { useReducedMotion } from "@libs/react-motion"
import { enterSurface, prepareSurfaceEntrance, restSurface } from "../../appearance/surface-presence"
import { Surface, useTheme } from "@phreshos/react-ui"
import { absoluteWindowGeometry, resolveWindowValue, wholeWindowGeometry, windowPaintInsets, type WindowRegion, type WindowSurfaceSize } from "./window-geometry"
import { numericScale, type Position, type Size } from "@phreshos/core"
import WindowHeader from "./window-header"
import WindowSurface from "./window-surface"
import { type LocalAnimation, type LocalSurfaceState } from "../client-host/local-window"
import { type LocalGeometryReader } from "./local-windows"
import gsap from "gsap"

/**
 * A window: a pure function of the record it is given. Every render
 * declares the whole geometry from props — a float as left/top pixels,
 * a tile as its relative form — and CSS transitions animate whatever
 * changes between renders. There is no imperative geometry writer, no
 * birth snapshot, no mode to reconcile: a refreshed page renders the
 * truth it was born with because rendering the truth is all this
 * component does.
 *
 * A gesture is state, not a side channel: while one runs, the render
 * derives from the gesture's rectangle instead of the record — movement
 * rides a transform above the grabbed origin, transitions pause — and
 * release reports the outcome (onMove or onResize with resting pixels —
 * a resize carrying an origin only when the edge dragged moved one —
 * onSnap with the shares a zone names) and drops the gesture in the same
 * batch the record updates, so nothing jumps.
 *
 * GSAP keeps exactly one duty: presence — the scale and drift of entering,
 * minimising and closing on the painted surface, never the frame.
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

const settle = ["left", "top", "width", "height", "transform"].map(property => `${property} 0.3s cubic-bezier(0.65, 0, 0.35, 1)`).join(", ")

const morphing = ["left", "top", "width", "height"].map(property => `${property} 0.22s cubic-bezier(0.33, 1, 0.68, 1)`).join(", ")

export default function ({ title, icon, children, onClose, onClosed, onMinimize, onMaximize, onActivate, onUnavailable, onMove, onResize, onSnap, onLocalAnimationComplete, onLocalRepresentation, onFocusCapture, active = false, bare = false, closing = false, stopping = false, minimized = false, animateEntrance = true, position = { x: 0, y: 0 }, size = { width: 520, height: 340 }, localSurface, geometryAnimation, paintSurfaceSize = { width: 0, height: 0 }, minWidth = 260, minHeight = 160, className, style, ...props }: WindowProps) {

    const frame = useRef<HTMLDivElement>(null)

    const surfaceElement = useRef<HTMLDivElement>(null)

    const reducedMotion = useReducedMotion()

    const theme = useTheme()

    const radius = numericScale(theme.radius)

    const outerRadius = radius.large

    const innerRadius = radius.medium

    const [gesture, setGesture] = useState<Gesture | null>(null)

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

        if (!geometryAnimation) return

        const duration = reducedMotion ? 0 : geometryAnimation.transaction.duration ?? 300

        const completed = globalThis.setTimeout(() => onLocalAnimationComplete?.("geometry", geometryAnimation.revision), duration)

        return () => globalThis.clearTimeout(completed)

    }, [geometryAnimation?.revision, reducedMotion])

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

    // The render that lands a plain commit suppresses transitions for one
    // frame: the record now equals what the gesture showed, and the
    // decomposition swap (origin+transform to left alone) must not be
    // interpolated — two properties animating opposite ways cancel only
    // in exact math, and the browser's residue reads as drift.
    const [landed, setLanded] = useState(false)

    useLayoutEffect(function () {

        if (!landed) return

        const settle = requestAnimationFrame(() => setLanded(false))

        return () => cancelAnimationFrame(settle)

    }, [landed])

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

        // Pulling a shared window out of its placement belongs to the
        // header alone. An edge is not a hand asking to float — it is a
        // hand asking for a different size, and a window keeps whatever
        // of its placement that edge does not touch.
        let restoring = !absolute && edge === null

        let moved = false

        let morph = false

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
                morph = !reducedMotion

                if (morph) setTimeout(() => {

                    morph = false

                    setGesture(active => active && { ...active, morph: false })

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

                if (!reducedMotion) setLanded(true)
            }

            setGesture(null)
        }

        handle.addEventListener("pointermove", move)

        handle.addEventListener("pointerup", release)

        handle.addEventListener("pointercancel", release)

        setGesture({ origin, current, zone, shown, morph: false })
    }

    // ------------------------------------------------------------ render

    // The geometry, declared whole every render: the gesture's rectangle
    // while one runs — movement as a transform above the grabbed origin,
    // transitions paused — otherwise the record's own form.
    const geometry = gesture

        ? { left: gesture.origin.x, top: gesture.origin.y, width: gesture.current.width, height: gesture.current.height, transform: `translate(${gesture.current.x - gesture.origin.x}px, ${gesture.current.y - gesture.origin.y}px)`, transition: gesture.morph && !reducedMotion ? morphing : "none" }

        : {

            left: resolveWindowValue(position.x),

            top: resolveWindowValue(position.y),

            width: resolveWindowValue(size.width),

            height: resolveWindowValue(size.height),

            transform: "none",

            // Bare, geometry does not travel. A window the system
            // paints nothing on is one whose motion is not the
            // system's either: asked to be somewhere, it is there,
            // rather than gliding over half a second nobody asked for.
            transition: geometryAnimation && !reducedMotion

                ? explicitGeometryTransition(geometryAnimation)

                : bare || landed || reducedMotion ? "none" : settle
        }

    const surface = active

        ? "shadow-window-active"

        : "shadow-window-inactive"

    const paintedInsets = windowPaintInsets(position, size, paintSurfaceSize, gesture?.current)

    return <>

        {/* The snap preview and its result resolve the same edge contacts. */}
        {gesture?.shown && <div

            className="pointer-events-none absolute"

            style={{ left: resolveWindowValue(gesture.shown.position.x), top: resolveWindowValue(gesture.shown.position.y), width: resolveWindowValue(gesture.shown.size.width), height: resolveWindowValue(gesture.shown.size.height), opacity: gesture.zone ? 1 : 0, transition: reducedMotion ? "none" : "opacity 0.15s, left 0.18s, top 0.18s, width 0.18s, height 0.18s", zIndex: style?.zIndex }}

        >

            <div data-snap-preview-frame className="absolute border border-white/50 bg-white/25 shadow-snap-preview backdrop-blur-sm" style={bare ? { inset: 0 } : { ...windowPaintInsets(gesture.shown.position, gesture.shown.size, paintSurfaceSize), borderRadius: outerRadius }} />

        </div>}

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
            <div data-window-container ref={surfaceElement} style={bare ? { inset: 0 } : { ...paintedInsets, borderRadius: outerRadius, color: theme.foreground }} className={`absolute isolate grid ${bare ? "grid-rows-1" : `overflow-hidden grid-rows-[auto_minmax(0,1fr)] ${reducedMotion ? "" : "transition-shadow duration-200"} ${surface}`}`}>

                {/* Material is paint, not the interaction container. Keeping
                    it as a sibling behind the window contents prevents plain
                    overlays such as the inactive-window click catcher from
                    entering the Surface tree or receiving its effects. */}
                {!bare && <Surface

                    data-window-frame-surface

                    aria-hidden="true"

                    className="pointer-events-none absolute inset-0"

                    style={{ borderRadius: "inherit", zIndex: -1 }}

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

interface Snap {

    position: Position

    size: Size
}

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

    morph: boolean
}

function explicitGeometryTransition(animation: LocalAnimation) {

    const duration = animation.transaction.duration ?? 300

    const easing = animation.transaction.easing

    const curve = Array.isArray(easing) ? `cubic-bezier(${easing.join(", ")})` : easing ?? "ease-out"

    return ["left", "top", "width", "height"].map(property => `${property} ${duration}ms ${curve}`).join(", ")
}
