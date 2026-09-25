import { ComponentProps, PointerEvent as ReactPointerEvent, ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useReducedMotion } from "@libs/react-motion"
import { surfaceLifecyclePose, surfacePresencePose, surfacePresenceTransition } from "@client/view/appearance/surface-presence"
import WindowPanel from "./window-panel"
import { absoluteWindowGeometry, constrainWindowGeometry, minimumWindowSize, resolveWindowGeometry, windowPaintInsets, type WindowRegion, type WindowSurfaceSize } from "@client/view/components/window-manager/window-geometry"
import { type BeginWindowMoveGesture, type Position, type Size, type TaskbarPosition, type WindowPresentationSurface as WindowSurfaceDefinition, type WindowLayer } from "@phreshos/core"
import WindowHeader from "./window-header"
import WindowSurface, { windowSurfaceRadius } from "./window-surface"
import { type PresentationAnimation, type PresentationMoveGestureController, type PresentationMovePoint } from "@client/view/components/desktop-host/window-presentation"
import { type PresentationGeometryRepresentation } from "@client/view/components/window-manager/window-presentations"
import { motion } from "motion/react"
import { motionTransition, resolveWindowTransaction } from "@client/view/appearance/motion"
import { useAppearance, Window as UIWindow } from "@phreshos/react-ui"
import SnapPreview, { type SnapTarget } from "./snap-preview"
import useWindowGeometryMotion from "./window-geometry-motion"
import WindowGestureCommit from "./window-gesture-commit"
import { physicalToDesktopPixels, useDesktopScale } from "../desktop-scale"
import { createPortal } from "react-dom"

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
 * onSnap with the shares a zone names). The gesture retains the visible
 * result until those ordered authoritative mutations settle, then yields.
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

const windowSurfaceLifecyclePose = Object.freeze({
    visible: { ...surfaceLifecyclePose.visible, x: 0 },
    hidden: { ...surfaceLifecyclePose.hidden, x: 0 }
})

export function windowMinimizePose(position: TaskbarPosition) {

    const distance = 28

    return {
        scale: 0.86,
        x: position === "left" ? -distance : position === "right" ? distance : 0,
        y: position === "top" ? -distance : position === "bottom" ? distance : 0,
        opacity: 0
    }
}

export default function ({ title, header = true, surface, layer, icon, children, onClose, onClosed, onMinimize, onMaximize, onActivate, onUnavailable, onMove, onResize, onSnap, onPresentationAnimationComplete, onPresentationRepresentation, onPresentationMoveGesture, onFocusCapture, active = false, closing = false, stopping = false, minimized = false, maximized = false, interactive = true, entering = false, position = { x: 0, y: 0 }, size = { width: 520, height: 340 }, taskbarPosition = "bottom", surfaceAnimation, geometryAnimation, minimizeAnimation, paintSurfaceSize = { width: 0, height: 0 }, spacing = 0, minWidth = minimumWindowSize.width, minHeight = minimumWindowSize.height, className, style, ...props }: WindowProps) {

    const reducedMotion = useReducedMotion()
    const appearance = useAppearance()
    const appearanceTransaction = appearance.transaction
    const desktopScale = useDesktopScale()
    const standard = layer === "window"
    const surfaceDefinition = surface ?? (standard ? true : false)
    const surfaceRadius = surfaceDefinition === false ? undefined : windowSurfaceRadius(surfaceDefinition, appearance)
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
    const [settlingGeometry, setSettlingGeometry] = useState<WindowRegion | null>(null)
    const [externalMoveActive, setExternalMoveActive] = useState(false)
    const externalMove = useRef<ExternalMove | null>(null)
    const beginPointerGesture = useRef<(point: PresentationMovePoint) => ActivePointerGesture | null>(() => null)
    beginPointerGesture.current = point => {
        let active: ActivePointerGesture | null = null
        grab(point, null, gesture => { active = gesture })
        return active
    }

    useLayoutEffect(function () {

        if (!onPresentationRepresentation) return

        const representation: PresentationGeometryRepresentation = {
            read: geometryMotion.read,
            present: geometryMotion.present,
            begin: () => geometryMotion.beginGesture()?.region ?? null,
            finish: geometryMotion.finishGesture,
            cancel: geometryMotion.cancelGesture
        }

        onPresentationRepresentation(representation)

        return () => onPresentationRepresentation(null)

    }, [onPresentationRepresentation])

    const moveGestureController = useRef<PresentationMoveGestureController | null>(null)
    if (!moveGestureController.current) {
        moveGestureController.current = {
            begin(origin, point) {
                if (externalMove.current) throw new Error("This Window already has an active move gesture")
                const pointer = beginPointerGesture.current(origin)
                if (!pointer) throw new Error("This Window cannot currently begin a move gesture")
                pointer.update(point)
                let markReady: () => void = () => undefined
                const ready = new Promise<void>(resolve => { markReady = resolve })
                let finish: () => void = () => undefined
                const finished = new Promise<void>(resolve => { finish = resolve })
                externalMove.current = { pointer, markReady, finish }
                setExternalMoveActive(true)
                return { ready, finished, cancel: () => finishExternalMove(null) }
            },
            cancel: () => finishExternalMove(null)
        }
    }

    const beginWindowMoveGesture = useCallback<BeginWindowMoveGesture>(start => {
        return moveGestureController.current!.begin(start.origin, start.point)
    }, [])

    function finishExternalMove(point: PresentationMovePoint | null) {
        const active = externalMove.current
        if (!active) return
        externalMove.current = null
        setExternalMoveActive(false)
        // Cancellation may happen before the portal commits. Readiness must
        // still settle so the remote owner can observe the completed gesture.
        active.markReady()
        if (point) active.pointer.end(point)
        else active.pointer.cancel()
        active.finish()
    }

    useLayoutEffect(function () {
        if (!standard || !onPresentationMoveGesture) return
        // Program-owned chrome supplies pointer intent, while this controller
        // remains the single owner of geometry, snapping, and commit behavior.
        onPresentationMoveGesture(moveGestureController.current)
        return () => {
            moveGestureController.current?.cancel()
            onPresentationMoveGesture(null)
        }
    }, [standard, onPresentationMoveGesture])

    useEffect(function () {
        if (!externalMoveActive) return
        const cancel = () => finishExternalMove(null)
        const visibility = () => { if (document.hidden) cancel() }
        window.addEventListener("blur", cancel)
        document.addEventListener("visibilitychange", visibility)
        return () => {
            window.removeEventListener("blur", cancel)
            document.removeEventListener("visibilitychange", visibility)
        }
    }, [externalMoveActive])

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

    const entryTransaction = standard ? appearanceTransaction : null
    const opening = entering && !reducedMotion ? entryTransaction : null
    const [opened, setOpened] = useState(opening === null)
    const minimizeTransaction = minimizeAnimation
        ? resolveWindowTransaction(minimizeAnimation.transaction, appearanceTransaction)
        : null
    const initialPresence = standard
        ? opening ? windowSurfaceLifecyclePose.hidden : windowSurfaceLifecyclePose.visible
        : opening ? surfaceLifecyclePose.hidden : surfaceLifecyclePose.visible

    const presencePose = closing && standard
        ? windowSurfaceLifecyclePose.hidden
        : minimized
            ? standard ? windowMinimizePose(taskbarPosition) : surfacePresencePose.entering
            : standard ? windowSurfaceLifecyclePose.visible : surfaceLifecyclePose.visible

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

    function grab(event: ReactPointerEvent<HTMLElement> | PresentationMovePoint, edge: WindowEdge | null, receive?: (gesture: ActivePointerGesture) => void) {

        if (maximized && edge !== null) return

        const external = receive !== undefined
        const pointer = external
            ? event as PresentationMovePoint
            : { x: (event as ReactPointerEvent<HTMLElement>).clientX, y: (event as ReactPointerEvent<HTMLElement>).clientY }

        // A cancelled pointerdown suppresses double-click synthesis, and
        // a shared window restores by double-click; absolute ones keep
        // it to block native drags.
        if (absolute && !external) (event as ReactPointerEvent<HTMLElement>).preventDefault()

        const handle = external ? null : (event as ReactPointerEvent<HTMLElement>).currentTarget

        if (handle) handle.setPointerCapture((event as ReactPointerEvent<HTMLElement>).pointerId)

        const started = geometryMotion.beginGesture()

        if (!started) return

        const { bounds, revision } = started

        setSettlingGeometry(null)

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

        const commit = new WindowGestureCommit()

        function request(operation: () => Promise<boolean> | undefined) {

            commit.request(operation)
        }

        function settle() {

            void commit.settle().then(committed => {

                const current = committed
                    ? geometryMotion.settleGesture(revision)
                    : geometryMotion.cancelGesture(revision)

                if (current) setSettlingGeometry(null)
            })
        }

        const start = { pointerX: pointer.x, pointerY: pointer.y }

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
        function snapTerm(motion: PresentationMovePoint): Snap | null {

            const pointerX = physicalToDesktopPixels(motion.x - bounds!.left, desktopScale)

            const pointerY = physicalToDesktopPixels(motion.y - bounds!.top, desktopScale)

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

        function move(motion: PresentationMovePoint) {

            const physicalX = motion.x - start.pointerX

            const physicalY = motion.y - start.pointerY

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
                const pointerX = physicalToDesktopPixels(motion.x - bounds!.left, desktopScale)

                const pointerY = physicalToDesktopPixels(motion.y - bounds!.top, desktopScale)

                const ratio = Math.min(Math.max((pointerX - origin.x) / origin.width, 0), 1)

                const restoringMaximized = maximized

                if (restoringMaximized) {
                    const stored = resolvePresentedGeometry(position, size, bounds)
                    origin = { ...origin, width: stored.width, height: stored.height }
                    request(() => onMaximize?.())
                }

                origin = { x: pointerX - origin.width * ratio, y: pointerY - Math.min(Math.max(pointerY - origin.y, 0), 40), width: origin.width, height: origin.height }

                current = { ...origin }

                start.pointerX = motion.x

                start.pointerY = motion.y

                request(() => onMove?.(origin.x, origin.y))

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

        function release(motion: PresentationMovePoint, committed: boolean) {

            if (renderFrame) cancelAnimationFrame(renderFrame)

            // A tiled press that never crossed the threshold changed
            // nothing: the render returns to the tile it never left.
            if (restoring) {

                geometryMotion.finishGesture(undefined, revision)
                setSettlingGeometry(null)
                setGesture(null)

                return
            }

            const term = moved && edge === null && committed ? snapTerm(motion) : null

            // Pointer input has ended, but visible gesture ownership remains
            // until every authoritative mutation below has settled.
            if (term) {

                const target = resolvePresentedGeometry(term.position, term.size, bounds)
                geometryMotion.targetGesture(revision, target)
                setSettlingGeometry(target)
                request(() => onSnap?.(term.position, term.size))
                settle()
            }

            else if (moved && committed) {

                setSettlingGeometry(current)

                if (edge === null) request(() => onMove?.(current.x, current.y))

                // Only the west and north edges move the origin. A drag
                // on any other reports no position, because none was
                // chosen — and a position nobody chose would replace a
                // share with the pixels it happened to resolve to.
                else request(() => onResize?.(current.width, current.height, current.x === origin.x && current.y === origin.y ? null : { x: current.x, y: current.y }))

                settle()

            }

            else if (!committed) {

                geometryMotion.cancelGesture(revision)
                setSettlingGeometry(null)
            }

            else {

                geometryMotion.finishGesture(undefined, revision)
                setSettlingGeometry(null)
            }

            setGesture(null)
        }

        if (handle) {
            const movePointer = (motion: globalThis.PointerEvent) => move({ x: motion.clientX, y: motion.clientY })
            const releasePointer = (motion: globalThis.PointerEvent) => {
                handle.removeEventListener("pointermove", movePointer)
                handle.removeEventListener("pointerup", releasePointer)
                handle.removeEventListener("pointercancel", releasePointer)
                release({ x: motion.clientX, y: motion.clientY }, motion.type === "pointerup")
            }
            handle.addEventListener("pointermove", movePointer)
            handle.addEventListener("pointerup", releasePointer)
            handle.addEventListener("pointercancel", releasePointer)
        }
        else receive?.({
            update: move,
            end(point) { release(point, true) },
            cancel() { release(pointer, false) }
        })

        setGesture({ origin, current, zone, shown })
    }

    // ------------------------------------------------------------ render

    // Shared geometry remains contiguous. Each neighboring Window contributes
    // half of Appearance spacing so the painted gap equals the layer inset.
    const paintInset = standard ? spacing / 2 : 0

    // Pointer input may end before its authoritative mutation settles. Paint
    // follows the same locally owned geometry throughout that interval so an
    // old boundary contact cannot flash back for one frame.
    const paintedInsets = windowPaintInsets(presented.current.position, presented.current.size, paintSurfaceSize, paintInset, gesture?.current ?? settlingGeometry ?? undefined)

    return <>

        {externalMoveActive && createPortal(<UIWindow.MoveCapture
            data-window-move-capture
            ref={element => { if (element) externalMove.current?.markReady() }}
            style={{ zIndex: 2147483647 }}
            onPointerMove={event => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
                    try { event.currentTarget.setPointerCapture(event.pointerId) }
                    catch { /* The full-viewport capture surface still owns in-bounds movement. */ }
                }
                externalMove.current?.pointer.update({ x: event.clientX, y: event.clientY })
            }}
            onPointerUp={event => finishExternalMove({ x: event.clientX, y: event.clientY })}
            onPointerCancel={() => finishExternalMove(null)}
        />, document.body)}

        {/* The snap preview and its result resolve the same edge contacts. */}
        {gesture?.shown && <SnapPreview
            shown={gesture.shown}
            visible={gesture.zone !== null}
            bare={!standard}
            minimumSize={presentationMinimum}
            paintSurfaceSize={paintSurfaceSize}
            paintInset={paintInset}
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

            // Only the Desktop can make the iframe's host box transparent to
            // lower layers; content inside the iframe cannot cross that boundary.
            className={`absolute ${minimized || closing || !interactive ? "pointer-events-none" : "pointer-events-auto"} ${className ?? ""}`}

            style={{ ...style, left: 0, top: 0, ...geometryMotion.style }}

            {...props}

            // A hidden pane is absent from sequential focus as well as
            // pointer hit-testing. Visibility currently provides the same
            // effect visually; inert states the interaction rule directly.
            inert={minimized || closing || !interactive}

        >

            {/* The painted surface, inset inside the box. The box is where
                the window *is*; this is what a person sees of it, and the
                difference between them is the gap.

                Without a Desktop surface, Program content fills the box and
                owns its visible boundary. */}
            {!standard ? <motion.div
                data-window-container
                initial={initialPresence}
                animate={presencePose}
                transition={presenceTransition}
                onAnimationComplete={completePresence}
                className="absolute isolate inset-0 grid grid-rows-1"
                style={{ visibility: minimized && presenceHidden ? "hidden" : "visible" }}
            >

                {(layer === "under" || layer === "over" || layer === "shell") && <WindowSurface
                    surface={surfaceDefinition}
                    animation={surfaceAnimation ?? null}
                    onComplete={revision => onPresentationAnimationComplete?.("surface", revision)}
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
                <WindowSurface
                    surface={surfaceDefinition}
                    animation={surfaceAnimation ?? null}
                    onComplete={revision => onPresentationAnimationComplete?.("surface", revision)}
                />

                <WindowPanel
                // Surface paint and Program content are siblings. The content
                // must independently clip to the same Desktop-owned boundary.
                style={{ position: "absolute", inset: 0, borderRadius: surfaceRadius }}
                header={header ? <WindowHeader

                    title={title}

                    icon={icon}

                    active={active}

                    whole={whole}

                    beginMoveGesture={beginWindowMoveGesture}

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

    /** Desktop-painted Window backing surface. */
    surface?: WindowSurfaceDefinition

    /** Presentation role currently occupied by the Window. */
    layer: WindowLayer

    // Drawn beside the title. A URL rather than a node: what a window
    // shows of its program is a picture the browser fetches, and the
    // path it fetches from is the view's to build.
    icon: string

    onClose?: () => void

    onClosed?: () => void

    onMinimize?: () => void

    onMaximize?: () => Promise<boolean>

    onActivate?: () => void

    /** The window is leaving interaction; its composition chooses new focus. */
    onUnavailable?: (reason: "minimize" | "close") => void

    onMove?: (x: number, y: number) => Promise<boolean>

    onResize?: (width: number, height: number, position: { x: number, y: number } | null) => Promise<boolean>

    onSnap?: (position: Position, size: Size) => Promise<boolean>

    active?: boolean

    closing?: boolean

    /** The Process termination request has not settled yet. */
    stopping?: boolean

    minimized?: boolean

    maximized?: boolean

    /** Whether this presentation participates in focus and hit testing. */
    interactive?: boolean

    /** Whether mounting this element represents a newly opened Window. */
    entering?: boolean

    position?: Position

    size?: Size

    /** Desktop edge toward which this standard Window minimizes. */
    taskbarPosition?: TaskbarPosition

    surfaceAnimation?: PresentationAnimation | null

    geometryAnimation?: PresentationAnimation | null

    minimizeAnimation?: PresentationAnimation | null

    onPresentationAnimationComplete?: (kind: "geometry" | "minimize" | "surface", revision: number) => void

    onPresentationRepresentation?: (representation: PresentationGeometryRepresentation | null) => void

    onPresentationMoveGesture?: (controller: PresentationMoveGestureController | null) => void

    /** Surface used only to decide which painted edges receive an inset. */
    paintSurfaceSize?: WindowSurfaceSize

    /** Appearance spacing shared by the layer boundary and tiled gaps. */
    spacing?: number

    minWidth?: number

    minHeight?: number

}

interface Gesture {

    origin: WindowRegion

    current: WindowRegion

    zone: Snap | null

    shown: Snap | null
}

interface ActivePointerGesture {
    update(point: PresentationMovePoint): void
    end(point: PresentationMovePoint): void
    cancel(): void
}

interface ExternalMove {
    pointer: ActivePointerGesture
    markReady: () => void
    finish: () => void
}
