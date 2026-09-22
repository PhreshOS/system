import { ComponentProps, PointerEvent as ReactPointerEvent, ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useReducedMotion } from "@libs/react-motion"
import { surfaceLifecyclePose, surfacePresencePose, surfacePresenceTransition } from "@client/view/appearance/surface-presence"
import WindowPanel from "./window-panel"
import { absoluteWindowGeometry, constrainWindowGeometry, minimumWindowSize, resolveWindowGeometry, windowPaintInsets, type WindowRegion, type WindowSurfaceSize } from "@client/view/components/window-manager/window-geometry"
import { type Position, type Size, type WindowFrame as WindowFrameDefinition, type WindowLayer, type WindowTransaction } from "@phreshos/core"
import WindowHeader from "./window-header"
import WindowFrame from "./window-frame"
import { type PresentationAnimation } from "@client/view/components/desktop-host/window-presentation"
import { type PresentationGeometryRepresentation } from "@client/view/components/window-manager/window-presentations"
import { motion } from "motion/react"
import { motionTransition, resolveWindowTransaction } from "@client/view/appearance/motion"
import { useAppearance } from "@phreshos/react-ui"
import SnapPreview, { type SnapTarget } from "./snap-preview"
import { windowPaintInset } from "../geometry"
import useWindowGeometryMotion from "./window-geometry-motion"
import { physicalToDesktopPixels, useDesktopScale } from "../desktop-scale"

/**
 * A window: a pure function of the record it is given. Every render
 * declares the whole target geometry from props — a float as left/top
 * pixels, a tile as its relative form. Motion interpolates only the Desktop
 * presentation between targets; the record remains the truth and a
 * refreshed page renders that truth directly.
 *
 * One set of Motion values owns the visible pixel geometry from rest,
 * through a gesture, and into the next target. Release reports the outcome
 * (onMove or onResize with resting pixels —
 * a resize carrying an origin only when the edge dragged moved one —
 * onSnap with the shares a zone names) and drops the gesture in the same
 * batch the record updates, so nothing jumps.
 *
 * Motion owns every local interpolation, never the authoritative record.
 *
 * The chrome uses the shared system material. Content currently uses the
 * plain WindowPanel test. The close control requests — the window leaves only when the truth
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

const minimizedSurfacePose = { scale: 0.86, y: 28, opacity: 0 }

export default function ({ title, header = true, frame: frameDefinition = false, layer, icon, children, onClose, onClosed, onMinimize, onMaximize, onActivate, onUnavailable, onMove, onResize, onSnap, onPresentationAnimationComplete, onPresentationRepresentation, onFocusCapture, active = false, closing = false, stopping = false, minimized = false, maximized = false, entering = false, transaction = false, position = { x: 0, y: 0 }, size = { width: 520, height: 340 }, frameAnimation, geometryAnimation, minimizeAnimation, paintSurfaceSize = { width: 0, height: 0 }, minWidth = minimumWindowSize.width, minHeight = minimumWindowSize.height, className, style, ...props }: WindowProps) {

    const reducedMotion = useReducedMotion()
    const appearanceTransaction = useAppearance().transaction
    const desktopScale = useDesktopScale()
    const standard = layer === "window"
    const presentationMinimum = standard ? { width: minWidth, height: minHeight } : undefined

    function resolvePresentedGeometry(selectedPosition: Position, selectedSize: Size, surface: WindowSurfaceSize) {

        const region = resolveWindowGeometry(selectedPosition, selectedSize, surface)

        return presentationMinimum ? constrainWindowGeometry(region, surface, presentationMinimum) : region
    }

    // Hidden windows retain their last presentation while lower-priority state changes.
    const presented = useRef({ position, size })
    if (!minimized) presented.current = maximized
        ? { position: { x: "0%", y: "0%" }, size: { width: "100%", height: "100%" } }
        : { position, size }

    const geometryMotion = useWindowGeometryMotion({
        position: presented.current.position,
        size: presented.current.size,
        animation: geometryAnimation,
        immediate: reducedMotion,
        minimumSize: presentationMinimum,
        onComplete: revision => onPresentationAnimationComplete?.("geometry", revision)
    })

    const frameElement = geometryMotion.frame

    const [gesture, setGesture] = useState<Gesture | null>(null)

    useLayoutEffect(function () {

        if (!onPresentationRepresentation) return

        const representation: PresentationGeometryRepresentation = {
            read: geometryMotion.read,
            present: geometryMotion.present,
            begin: () => geometryMotion.beginGesture()?.region ?? null,
            finish: geometryMotion.finishGesture,
            cancel: geometryMotion.cancelGesture,
            listen: geometryMotion.listen
        }

        onPresentationRepresentation(representation)

        return () => onPresentationRepresentation(null)

    }, [onPresentationRepresentation])

    const closureCompleted = useRef(false)

    function completeClosure() {

        if (closureCompleted.current) return

        closureCompleted.current = true

        onClosed?.()
    }

    // A window is absolute when none of its expressions depends on the surface.
    const absolute = absoluteWindowGeometry(presented.current.position, presented.current.size)

    const whole = maximized

    const [presenceHidden, setPresenceHidden] = useState(minimized)

    useLayoutEffect(function () {

        if (!minimized) setPresenceHidden(false)

        else if (reducedMotion) setPresenceHidden(true)

    }, [minimized, reducedMotion])

    useEffect(function () {

        if (minimized) onUnavailable?.("minimize")

    }, [minimized])

    useEffect(function () {

        if (!closing) return

        onUnavailable?.("close")

        if (!standard || reducedMotion) completeClosure()

    }, [closing, standard, reducedMotion])

    useEffect(function () {

        const revision = minimizeAnimation?.revision

        if (revision === undefined || minimizeTransaction && !reducedMotion) return

        onPresentationAnimationComplete?.("minimize", revision)

    }, [minimizeAnimation?.revision, reducedMotion])

    const entryTransaction = layer === "under" || layer === "over"
        ? resolveWindowTransaction(transaction, appearanceTransaction)
        : standard ? appearanceTransaction : null
    const opening = entering && !reducedMotion ? entryTransaction : null
    const [opened, setOpened] = useState(opening === null)
    const minimizeTransaction = minimizeAnimation
        ? resolveWindowTransaction(minimizeAnimation.transaction, appearanceTransaction)
        : null
    const initialPresence = opening ? surfaceLifecyclePose.hidden : surfaceLifecyclePose.visible

    const presencePose = closing && standard
        ? surfaceLifecyclePose.hidden
        : minimized
            ? standard ? minimizedSurfacePose : surfacePresencePose.entering
            : surfaceLifecyclePose.visible

    const presenceTransition = reducedMotion
        ? { duration: 0 }
        : closing && standard
            ? motionTransition(appearanceTransaction)
            : minimizeTransaction
                ? surfacePresenceTransition(false, minimizeTransaction)
                : !opened && opening
                    ? surfacePresenceTransition(false, opening)
                    : { duration: 0 }

    function completePresence() {

        if (!opened) setOpened(true)

        if (closing && standard) completeClosure()

        if (minimized) setPresenceHidden(true)

        const revision = minimizeAnimation?.revision

        if (revision !== undefined && minimizeTransaction && !reducedMotion) {

            onPresentationAnimationComplete?.("minimize", revision)
        }
    }

    function grab(event: ReactPointerEvent<HTMLElement>, edge: WindowEdge | null) {

        if (maximized && edge !== null) return

        // A cancelled pointerdown suppresses double-click synthesis, and
        // a shared window restores by double-click; absolute ones keep
        // it to block native drags.
        if (absolute) event.preventDefault()

        const handle = event.currentTarget

        handle.setPointerCapture(event.pointerId)

        const started = geometryMotion.beginGesture()

        if (!started) return

        const { bounds } = started

        // The Motion values are the current visible representation, including
        // a geometry animation interrupted by this press.
        let origin: WindowRegion = started.region

        let current: WindowRegion = { ...origin }

        if (geometryAnimation) onPresentationAnimationComplete?.("geometry", geometryAnimation.revision)

        // Pulling a shared window out of its placement belongs to the
        // header alone. An edge is not a hand asking to float — it is a
        // hand asking for a different size, and a window keeps whatever
        // of its placement that edge does not touch.
        let restoring = !absolute && edge === null

        let moved = false

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

                setGesture({ origin, current, zone, shown })
            })
        }

        // Zones are where the pointer is — within 16px of an edge — and
        // they name shares of the surface, which each client resolves in
        // its own space.
        function snapTerm(motion: globalThis.PointerEvent): Snap | null {

            const pointerX = physicalToDesktopPixels(motion.clientX - bounds!.left, desktopScale)

            const pointerY = physicalToDesktopPixels(motion.clientY - bounds!.top, desktopScale)

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

            const physicalX = motion.clientX - start.pointerX

            const physicalY = motion.clientY - start.pointerY

            const dx = physicalToDesktopPixels(physicalX, desktopScale)

            const dy = physicalToDesktopPixels(physicalY, desktopScale)

            // A click is not a drag: without this, releasing a stationary
            // press inside a snap zone would snap the window.
            if (Math.hypot(physicalX, physicalY) >= 4) moved = true

            if (restoring) {

                if (Math.hypot(physicalX, physicalY) < 8) return

                restoring = false

                // The window returns to its floating size placed so the
                // pointer keeps its proportional position across the
                // header, and the same gesture carries on dragging.
                const pointerX = physicalToDesktopPixels(motion.clientX - bounds!.left, desktopScale)

                const pointerY = physicalToDesktopPixels(motion.clientY - bounds!.top, desktopScale)

                const ratio = Math.min(Math.max((pointerX - origin.x) / origin.width, 0), 1)

                const restoringMaximized = maximized

                if (restoringMaximized) {
                    const stored = resolvePresentedGeometry(position, size, bounds)
                    origin = { ...origin, width: stored.width, height: stored.height }
                    onMaximize?.()
                }

                origin = { x: pointerX - origin.width * ratio, y: pointerY - Math.min(Math.max(pointerY - origin.y, 0), 40), width: origin.width, height: origin.height }

                current = { ...origin }

                start.pointerX = motion.clientX

                start.pointerY = motion.clientY

                onMove?.(origin.x, origin.y)

                if (restoringMaximized) geometryMotion.restoreGesture(current)

                else geometryMotion.updateGesture(current)
                setGesture({ origin, current, zone, shown })

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

            geometryMotion.updateGesture(current)
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

                geometryMotion.finishGesture()
                setGesture(null)

                return
            }

            const term = moved && edge === null && motion.type === "pointerup" ? snapTerm(motion) : null

            // The outcome and the gesture's end land in one batch: the
            // record updates as the gesture stops overriding it, so the
            // frame never shows a stale in-between.
            if (term) {

                geometryMotion.finishGesture(resolvePresentedGeometry(term.position, term.size, bounds))
                onSnap?.(term.position, term.size)
            }

            else if (moved && motion.type === "pointerup") {

                geometryMotion.finishGesture()

                if (edge === null) onMove?.(current.x, current.y)

                // Only the west and north edges move the origin. A drag
                // on any other reports no position, because none was
                // chosen — and a position nobody chose would replace a
                // share with the pixels it happened to resolve to.
                else onResize?.(current.width, current.height, current.x === origin.x && current.y === origin.y ? null : { x: current.x, y: current.y })

            }

            else if (motion.type === "pointercancel") geometryMotion.cancelGesture()

            else geometryMotion.finishGesture()

            setGesture(null)
        }

        handle.addEventListener("pointermove", move)

        handle.addEventListener("pointerup", release)

        handle.addEventListener("pointercancel", release)

        setGesture({ origin, current, zone, shown })
    }

    // ------------------------------------------------------------ render

    const paintedInsets = windowPaintInsets(presented.current.position, presented.current.size, paintSurfaceSize, windowPaintInset, gesture?.current)

    return <>

        {/* The snap preview and its result resolve the same edge contacts. */}
        {gesture?.shown && <SnapPreview
            shown={gesture.shown}
            visible={gesture.zone !== null}
            bare={!standard}
            minimumSize={presentationMinimum}
            paintSurfaceSize={paintSurfaceSize}
            reducedMotion={reducedMotion}
            zIndex={style?.zIndex}
        />}

        <motion.div

            ref={frameElement}

            onPointerDown={onActivate}

            // DOM focus and desktop focus are one fact. Tabbing into a
            // background window therefore raises the same window a press
            // would; the keyboard does not maintain a second selection.
            onFocusCapture={event => {

                if (!active && !minimized && !closing) onActivate?.()

                onFocusCapture?.(event)
            }}

            className={`absolute ${minimized || closing ? "pointer-events-none" : "pointer-events-auto"} ${className ?? ""}`}

            style={{ ...style, left: 0, top: 0, ...geometryMotion.style }}

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
            {!standard ? <motion.div
                data-window-container
                initial={initialPresence}
                animate={presencePose}
                transition={presenceTransition}
                onAnimationComplete={completePresence}
                className="absolute isolate inset-0 grid grid-rows-1"
                style={{ visibility: minimized && presenceHidden ? "hidden" : "visible" }}
            >

                {(layer === "under" || layer === "over") && <WindowFrame
                    frame={frameDefinition}
                    animation={frameAnimation ?? null}
                    onComplete={revision => onPresentationAnimationComplete?.("frame", revision)}
                />}

                <div data-window-content className="relative min-h-0">{children}</div>

            </motion.div> : <motion.div
                data-window-container
                initial={initialPresence}
                animate={presencePose}
                transition={presenceTransition}
                onAnimationComplete={completePresence}
                style={{ position: "absolute", visibility: minimized && presenceHidden ? "hidden" : "visible", ...paintedInsets }}
            >
                <WindowPanel
                style={{ position: "absolute", inset: 0 }}
                header={header ? <WindowHeader

                    title={title}

                    icon={icon}

                    active={active}

                    whole={whole}

                    onGrab={event => grab(event, null)}

                    onMinimize={onMinimize}

                    onMaximize={onMaximize}

                    onClose={onClose}

                    stopping={stopping || closing}

                /> : null}
            >{children}</WindowPanel>
            </motion.div>}

            {standard && edges.map(handle => <div

                key={handle.edge}

                onPointerDown={event => grab(event, handle.edge)}

                className={`absolute touch-none ${handle.className}`}

            />)}

        </motion.div>

    </>
}

type WindowEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

type Snap = SnapTarget

interface WindowProps extends Omit<ComponentProps<"div">, "onAnimationStart" | "onDrag" | "onDragEnd" | "onDragStart" | "title"> {

    title?: ReactNode

    /** Whether the Desktop-owned standard Window header is shown. */
    header?: boolean

    /** Frame definition applied by under and over presentations. */
    frame?: WindowFrameDefinition

    /** Presentation role currently occupied by the Window. */
    layer: WindowLayer

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

    closing?: boolean

    /** The Process termination request has not settled yet. */
    stopping?: boolean

    minimized?: boolean

    maximized?: boolean

    /** Whether mounting this element represents a newly opened Window. */
    entering?: boolean

    /** Default transaction used by under and over presentations. */
    transaction?: WindowTransaction

    position?: Position

    size?: Size

    frameAnimation?: PresentationAnimation | null

    geometryAnimation?: PresentationAnimation | null

    minimizeAnimation?: PresentationAnimation | null

    onPresentationAnimationComplete?: (kind: "geometry" | "minimize" | "frame", revision: number) => void

    onPresentationRepresentation?: (representation: PresentationGeometryRepresentation | null) => void

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
}
