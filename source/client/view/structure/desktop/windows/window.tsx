import { ComponentProps, PointerEvent as ReactPointerEvent, ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import { useReducedMotion } from "@libs/react-motion"
import { surfaceLifecyclePose, surfacePresenceTransition } from "@client/view/appearance/surface-presence"
import WindowPanel from "./window-panel"
import { absoluteWindowGeometry, allWindowSides, constrainWindowGeometry, contactInsets, letGoOfEdges, minimumWindowSize, noPaintMargins, noWindowSides, planeGeometry, resolveWindowGeometry, snapPlacement, windowEdgeContacts, windowPaintInsets, type PaintMargins, type WindowRegion, type WindowSides, type ViewSize } from "@client/view/components/window-manager/window-geometry"
import { type BeginPresentationMoveGesture, type Position, type Size, type TaskbarPosition, type PresentationSurface as WindowSurfaceDefinition, type WindowLayer } from "@phreshos/core"
import WindowHeader from "./window-header"
import WindowSurface, { windowSurfaceRadius } from "./window-surface"
import { type PresentationAnimation, type DesktopMoveGestureController, type DesktopMovePoint } from "@client/view/components/desktop-host/presentation"
import { type PresentationGeometryRepresentation } from "@client/view/components/window-manager/presentations"
import { motion, useMotionValue, type MotionValue } from "motion/react"
import { PlaneSlideContext, ViewCellShift } from "../plane-slide"
import { EdgeHold, against } from "../edge-hold"
import { motionTransition, resolvePresentationTransaction } from "@client/view/appearance/motion"
import { useAppearance, timing } from "@phreshos/react-ui"
import SnapPreview, { type SnapTarget } from "./snap-preview"
import useWindowGeometryMotion from "./window-geometry-motion"
import WindowGestureCommit from "./window-gesture-commit"
import { physicalToDesktopPixels, useDesktopScale } from "../desktop-scale"

/**
 * One drawing on the Desktop: a standard Window, which the Desktop designs, or a Program's own drawing
 * in another layer. Every render declares the whole target geometry from props; Motion values own the
 * visible pixels from rest, through a gesture, and into the next target, while the System's record
 * stays the truth. A gesture's release reports its outcome (onMove, onResize with an origin only when
 * the dragged edge moved one, or onSnap with the shares a zone names) and keeps the visible result
 * until those requests settle.
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

const wholeView: Position = Object.freeze({ x: "-1/2", y: "-1/2" })

export default function ({ title, header = true, surface, layer, icon, children, onClose, onClosed, onMinimize, onMaximize, onActivate, onUnavailable, onMove, onResize, onSnap, onPresentationAnimationComplete, onPresentationRepresentation, onPresentationMoveGesture, onFocusCapture, onEdgeHold, neighbours, active = false, closing = false, stopping = false, minimized = false, maximized = false, maximizedPosition = wholeView, interactive = true, entering = false, position = { x: 0, y: 0 }, size = { width: 0, height: 0 }, taskbarPosition = "bottom", surfaceAnimation, geometryAnimation, minimizeAnimation, paintSurfaceSize = { width: 0, height: 0 }, paintMargins = noPaintMargins, spacing = 0, className, style, ...props }: WindowProps) {

    const reducedMotion = useReducedMotion()
    const appearance = useAppearance()
    const desktopScale = useDesktopScale()
    const standard = layer === "window"
    const surfaceDefinition = surface ?? (standard ? true : false)
    const surfaceRadius = surfaceDefinition === false ? undefined : windowSurfaceRadius(surfaceDefinition, appearance)
    const presentationMinimum = standard ? minimumWindowSize : undefined
    const { width: minWidth, height: minHeight } = minimumWindowSize

    function resolvePresentedGeometry(selectedPosition: Position, selectedSize: Size, surface: ViewSize) {

        const region = resolveWindowGeometry(selectedPosition, selectedSize, surface)

        return presentationMinimum ? constrainWindowGeometry(region, surface, presentationMinimum) : region
    }

    // Hidden windows retain their last presentation while lower-priority state changes.
    const presented = useRef({ position, size })
    if (!minimized) presented.current = maximized
        ? { position: maximizedPosition, size: { width: "1/1", height: "1/1" } }
        : { position, size }

    const geometryMotion = useWindowGeometryMotion({
        position: presented.current.position,
        size: presented.current.size,
        animation: geometryAnimation,
        immediate: reducedMotion,
        // The Desktop moves its own Windows visibly only when the person sees one end or both; a
        // raw drawing moves the way its Program asked.
        seenOnly: standard,
        minimumSize: presentationMinimum,
        onComplete: revision => onPresentationAnimationComplete?.("geometry", revision)
    })

    const frameElement = geometryMotion.frame

    // A drag reads the handlers as they are when it acts, not as they were when it began: the view
    // can move under a held Window, and where the Window lands depends on where the view is then.
    const latest = useRef({ onMove, onResize, onSnap, onEdgeHold, neighbours })

    latest.current = { onMove, onResize, onSnap, onEdgeHold, neighbours }

    // While a hand holds a standard Window, the plane may glide beneath it; the Window stays under
    // the hand by taking that glide back.
    const slide = useContext(PlaneSlideContext)
    const cellShift = useContext(ViewCellShift)
    const held = useMotionValue(0)
    const shownX = useHeldAgainst(geometryMotion.style.x, held, slide?.x)
    const shownY = useHeldAgainst(geometryMotion.style.y, held, slide?.y)

    const [gesture, setGesture] = useState<Gesture | null>(null)
    const [settlingGeometry, setSettlingGeometry] = useState<WindowRegion | null>(null)
    const [externalMoveActive, setExternalMoveActive] = useState(false)
    const externalMove = useRef<ExternalMove | null>(null)
    const beginPointerGesture = useRef<(point: DesktopMovePoint) => ActivePointerGesture | null>(() => null)
    beginPointerGesture.current = point => {
        let active: ActivePointerGesture | null = null
        grab(point, null, gesture => { active = gesture })
        return active
    }

    useLayoutEffect(function () {

        if (!onPresentationRepresentation) return

        const representation: PresentationGeometryRepresentation = {
            read: geometryMotion.read,
            watch: geometryMotion.watch,
            present: geometryMotion.present,
            begin: () => geometryMotion.beginGesture()?.region ?? null,
            finish: geometryMotion.finishGesture,
            cancel: geometryMotion.cancelGesture
        }

        onPresentationRepresentation(representation)

        return () => onPresentationRepresentation(null)

    }, [onPresentationRepresentation])

    const moveGestureController = useRef<DesktopMoveGestureController | null>(null)
    if (!moveGestureController.current) {
        moveGestureController.current = {
            begin(origin, point) {
                if (externalMove.current) throw new Error("This Window already has an active move gesture")
                const pointer = beginPointerGesture.current(origin)
                if (!pointer) throw new Error("This Window cannot currently begin a move gesture")
                pointer.update(point)
                let finish: () => void = () => undefined
                const finished = new Promise<void>(resolve => { finish = resolve })
                const move = { pointer, finish }
                externalMove.current = move
                setExternalMoveActive(true)
                // The Client document holds the pointer and reports it; the move is ready once begun.
                return {
                    ready: Promise.resolve(),
                    finished,
                    move: next => { if (externalMove.current === move) move.pointer.update(next) },
                    end: last => { if (externalMove.current === move) finishExternalMove(last) },
                    cancel: () => { if (externalMove.current === move) finishExternalMove(null) }
                }
            },
            cancel: () => finishExternalMove(null)
        }
    }

    const beginWindowMoveGesture = useCallback<BeginPresentationMoveGesture>(start => {
        return moveGestureController.current!.begin(start.origin, start.point)
    }, [])

    function finishExternalMove(point: DesktopMovePoint | null) {
        const active = externalMove.current
        if (!active) return
        externalMove.current = null
        setExternalMoveActive(false)
        if (point) active.pointer.end(point)
        else active.pointer.cancel()
        active.finish()
    }

    useLayoutEffect(function () {
        // Every drawing but the wallpaper can hand a move to the Desktop.
        if (layer === "wallpaper" || !onPresentationMoveGesture) return
        // Program-owned chrome supplies pointer intent, while this controller
        // remains the single owner of geometry, snapping, and commit behavior.
        onPresentationMoveGesture(moveGestureController.current)
        return () => {
            moveGestureController.current?.cancel()
            onPresentationMoveGesture(null)
        }
    }, [layer, onPresentationMoveGesture])

    // A closing dialog, menu, or popover returns focus to what held it before it opened. Into a Window
    // no longer in front, that would bring it forward again, though no person chose it; the Desktop
    // keeps focus instead. React Aria announces each return with this cancelable event.
    useEffect(function () {
        const element = frameElement.current
        if (!element || active) return
        const decline = (event: Event) => {
            event.preventDefault()
            element.closest<HTMLElement>("[data-desktop]")?.focus({ preventScroll: true })
        }
        element.addEventListener("react-aria-focus-scope-restore", decline)
        return () => element.removeEventListener("react-aria-focus-scope-restore", decline)
    }, [frameElement, active])

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

    // A standard Window's motions are the Desktop's own, chosen from its size: appearing and leaving
    // happen in place, so they cover little of it; leaving for the Taskbar crosses more.
    const shownBox = geometryMotion.read()
    const reach = Math.hypot(shownBox.width, shownBox.height)
    const presenceMotion = timing("window", { distance: reach * 0.35, tempo: appearance.tempo })
    const entryTransaction = standard ? presenceMotion : null
    const opening = entering && !reducedMotion ? entryTransaction : null
    const [opened, setOpened] = useState(opening === null)
    const minimizeTransaction = minimizeAnimation
        ? resolvePresentationTransaction(minimizeAnimation.transaction, timing("window", { distance: reach * 0.75, tempo: appearance.tempo }))
        : null
    const initialPresence = standard
        ? opening ? windowSurfaceLifecyclePose.hidden : windowSurfaceLifecyclePose.visible
        : opening ? surfaceLifecyclePose.hidden : surfaceLifecyclePose.visible

    const presencePose = closing && standard
        ? windowSurfaceLifecyclePose.hidden
        : minimized
            // Only a standard Window is ever minimized.
            ? windowMinimizePose(taskbarPosition)
            : standard ? windowSurfaceLifecyclePose.visible : surfaceLifecyclePose.visible

    const presenceTransition = reducedMotion
        ? { duration: 0 }
        : closing && standard
            ? motionTransition(presenceMotion)
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

    /**
     * A double press on a standard Window's edge takes that edge as far as it can go that way: to
     * the nearest Window facing it there, or to the edge of the view. A corner takes both its edges.
     * The space kept between them is painted, so the edge goes all the way.
     */
    function extendEdge(edge: WindowEdge) {

        if (!standard || maximized) return

        const started = geometryMotion.beginGesture()

        if (!started) return

        const { bounds, revision, region: from } = started

        const others = latest.current.neighbours?.() ?? []

        const acrossY = (other: WindowRegion) => other.y < from.y + from.height && other.y + other.height > from.y

        const acrossX = (other: WindowRegion) => other.x < from.x + from.width && other.x + other.width > from.x

        let { x, y, width, height } = from

        if (edge.includes("e")) {

            const right = Math.min(bounds.width, ...others.filter(other => acrossY(other) && other.x >= from.x + from.width - 1).map(other => other.x))

            if (right > from.x + from.width) width = right - x
        }

        if (edge.includes("w")) {

            const left = Math.max(0, ...others.filter(other => acrossY(other) && other.x + other.width <= from.x + 1).map(other => other.x + other.width))

            if (left < from.x) { width += from.x - left; x = left }
        }

        if (edge.includes("s")) {

            const bottom = Math.min(bounds.height, ...others.filter(other => acrossX(other) && other.y >= from.y + from.height - 1).map(other => other.y))

            if (bottom > from.y + from.height) height = bottom - y
        }

        if (edge.includes("n")) {

            const top = Math.max(0, ...others.filter(other => acrossX(other) && other.y + other.height <= from.y + 1).map(other => other.y + other.height))

            if (top < from.y) { height += from.y - top; y = top }
        }

        const target = { x, y, width, height }

        if (x === from.x && y === from.y && width === from.width && height === from.height) {

            geometryMotion.finishGesture(undefined, revision)

            return
        }

        // Shown on its way at once, and held until the System has recorded it, like a release.
        geometryMotion.targetGesture(revision, target)
        setSettlingGeometry(target)

        const placed = planeGeometry(target, bounds)
        const commit = new WindowGestureCommit()

        commit.request(() => latest.current.onResize?.(width, height, x === from.x && y === from.y ? null : { x: placed.x, y: placed.y }))

        void commit.settle().then(committed => {

            const current = committed ? geometryMotion.settleGesture(revision) : geometryMotion.cancelGesture(revision)

            if (current) setSettlingGeometry(null)
        })
    }

    function grab(event: ReactPointerEvent<HTMLElement> | DesktopMovePoint, edge: WindowEdge | null, receive?: (gesture: ActivePointerGesture) => void) {

        if (maximized && edge !== null) return

        const external = receive !== undefined
        const pointer = external
            ? event as DesktopMovePoint
            : { x: (event as ReactPointerEvent<HTMLElement>).clientX, y: (event as ReactPointerEvent<HTMLElement>).clientY }

        // A Window placed in pixels blocks the browser's native drag; one placed by shares of the view
        // keeps the pointerdown, so a double press can still reach it.
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

        // What a person sees of the Window never jumps under the hand. The sides the gesture carries
        // let go of the edges they meet, the box moving in to keep the painted surface still; the
        // others keep the contact they had. A resize carries its edge at once, a move once it moves.
        const declared = started.region

        const contacts = windowEdgeContacts(presented.current.position, presented.current.size, paintSurfaceSize, origin, cellShift.get())

        let carried: WindowSides = edge !== null ? sidesOf(edge) : maximized ? noWindowSides : allWindowSides

        let insets = gestureInsets()

        let letGo = false

        function gestureInsets() {

            const kept = { top: contacts.top && !carried.top, right: contacts.right && !carried.right, bottom: contacts.bottom && !carried.bottom, left: contacts.left && !carried.left }

            return contactInsets(kept, paintInset, paintMargins)
        }

        function carry(sides: WindowSides) {

            carried = sides

            const box = letGoOfEdges(origin, contacts, sides, paintInset, paintMargins)

            if (box.width === origin.width && box.height === origin.height) return

            letGo = true

            origin = box

            current = { ...origin }

            insets = gestureInsets()

            // The box and its insets change in the same frame, so what is painted stays still.
            geometryMotion.reshapeGesture(shown => letGoOfEdges(shown, contacts, sides, paintInset, paintMargins))

            setInsets(insets)
        }

        if (carried !== noWindowSides) carry(carried)

        if (geometryAnimation) onPresentationAnimationComplete?.("geometry", geometryAnimation.revision)

        // Only a maximized Window waits for the hand to mean it: pulled out, it returns to its
        // floating size. Any other Window, placed in pixels or by shares of the view, keeps its size
        // and follows the hand at once. An edge is a hand asking for a different size, and the
        // Window keeps whatever of its place that edge does not touch.
        let restoring = maximized && edge === null

        let moved = false

        let zone: Snap | null = null

        let shown: Snap | null = null

        let renderFrame = 0

        // A hand holding a standard Window against an edge of the screen takes the view that way; see
        // EdgeHold. Where the plane goes no further, the preview of the placement turns to danger.
        let blocked = false

        const edges = new EdgeHold(direction => latest.current.onEdgeHold?.(direction), held => {

            blocked = held

            renderGesture()
        })

        function holdAgainst(motion: DesktopMovePoint) {

            edges.update(against(physicalToDesktopPixels(motion.x - bounds!.left, desktopScale), physicalToDesktopPixels(motion.y - bounds!.top, desktopScale), bounds!.width, bounds!.height))
        }

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

                setGesture({ origin, current, zone, shown, blocked, insets })
            })
        }

        // A zone is where the pointer is, within 16 pixels of an edge, and names a half or a quarter of
        // the room the view leaves for Windows, which each Desktop resolves in its own space.
        function snapTerm(motion: DesktopMovePoint): Snap | null {

            const direction = against(physicalToDesktopPixels(motion.x - bounds!.left, desktopScale), physicalToDesktopPixels(motion.y - bounds!.top, desktopScale), bounds!.width, bounds!.height)

            return direction.x || direction.y ? snapPlacement(direction, paintMargins) : null
        }

        function move(motion: DesktopMovePoint) {

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

                const stored = resolvePresentedGeometry(position, size, bounds)

                origin = { ...origin, width: stored.width, height: stored.height }

                carried = allWindowSides

                insets = contactInsets(noWindowSides, paintInset, paintMargins)

                request(() => onMaximize?.())

                origin = { x: pointerX - origin.width * ratio, y: pointerY - Math.min(Math.max(pointerY - origin.y, 0), 40), width: origin.width, height: origin.height }

                current = { ...origin }

                start.pointerX = motion.x

                start.pointerY = motion.y

                const floating = planeGeometry(origin, bounds!)

                request(() => latest.current.onMove?.(floating.x, floating.y))

                geometryMotion.restoreGesture(current)

                setGesture({ origin, current, zone, shown, blocked, insets })

                return
            }

            if (edge === null) {

                current = { ...origin, x: origin.x + dx, y: origin.y + dy }

                // Only the Desktop's own Windows snap; a raw drawing goes where it is taken.
                zone = moved && standard ? snapTerm(motion) : null

                if (moved && standard) {

                    held.set(1)

                    holdAgainst(motion)
                }

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

        function release(motion: DesktopMovePoint, committed: boolean) {

            edges.stop()

            held.set(0)

            if (renderFrame) cancelAnimationFrame(renderFrame)

            // A press on a maximized Window that never crossed the
            // threshold changed nothing: it stays maximized.
            if (restoring) {

                geometryMotion.finishGesture(undefined, revision)
                setSettlingGeometry(null)
                setGesture(null)

                return
            }

            const term = moved && edge === null && committed && standard ? snapTerm(motion) : null

            // Pointer input has ended, but visible gesture ownership remains
            // until every authoritative mutation below has settled.
            if (term) {

                const target = resolvePresentedGeometry(term.position, term.size, bounds)
                geometryMotion.targetGesture(revision, target)
                setSettlingGeometry(target)
                request(() => latest.current.onSnap?.(term.position, term.size))
                settle()
            }

            else if (moved && committed) {

                setSettlingGeometry(current)

                // The Desktop paints from the surface's corner; the System records from its center.
                const placed = planeGeometry(current, bounds!)

                // A Window whose sides let go of the edges keeps the size it is seen at.
                if (edge === null) request(() => letGo ? latest.current.onResize?.(current.width, current.height, { x: placed.x, y: placed.y }) : latest.current.onMove?.(placed.x, placed.y))

                // Only the west and north edges move the origin. A drag
                // on any other reports no position, because none was
                // chosen — and a position nobody chose would replace a
                // share with the pixels it happened to resolve to.
                else request(() => latest.current.onResize?.(current.width, current.height, current.x === declared.x && current.y === declared.y ? null : { x: placed.x, y: placed.y }))

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

        setGesture({ origin, current, zone, shown, blocked, insets })
    }

    // ------------------------------------------------------------ render

    // Shared geometry remains contiguous. Each neighboring Window contributes
    // half of Appearance spacing so the painted gap equals the layer inset.
    const paintInset = standard ? spacing / 2 : 0

    // Pointer input may end before its authoritative mutation settles. Paint
    // follows the same locally owned geometry throughout that interval so an
    // old boundary contact cannot flash back for one frame.
    // Follows where the view looks from, but redraws only when this Window's own margins change.
    const insetsNow = () => gesture?.insets ?? windowPaintInsets(presented.current.position, presented.current.size, paintSurfaceSize, paintInset, paintMargins, settlingGeometry ?? undefined, cellShift.get())
    const insetsKey = useSyncExternalStore(cellShift.subscribe, () => JSON.stringify(insetsNow()), () => JSON.stringify(insetsNow()))
    const paintedInsets = JSON.parse(insetsKey) as ReturnType<typeof windowPaintInsets>

    // The painted surface's insets are drawn with the box, as Motion values: a change to both in one
    // moment, such as sides letting go of the edges, shows in one frame and never half of it.
    const insetTop = useMotionValue(paintedInsets.top)
    const insetRight = useMotionValue(paintedInsets.right)
    const insetBottom = useMotionValue(paintedInsets.bottom)
    const insetLeft = useMotionValue(paintedInsets.left)

    function setInsets(insets: PaintMargins) {
        insetTop.set(insets.top)
        insetRight.set(insets.right)
        insetBottom.set(insets.bottom)
        insetLeft.set(insets.left)
    }

    useLayoutEffect(() => setInsets(paintedInsets), [insetsKey])

    return <>

        {/* The snap preview and its result resolve the same edge contacts. */}
        {gesture?.shown && <SnapPreview
            shown={gesture.shown}
            visible={gesture.zone !== null}
            blocked={gesture.blocked === true}
            minimumSize={presentationMinimum}
            paintSurfaceSize={paintSurfaceSize}
            paintInset={paintInset}

            paintMargins={paintMargins}
            reducedMotion={reducedMotion}
            zIndex={style?.zIndex}
        />}

        <motion.div

            ref={frameElement}

            // The box the Client's drawing is read in.
            data-window-box=""

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

            // Each window keeps its own compositor layer. Moving, raising, or
            // minimizing one window then only recomposites it, instead of
            // repainting the windows it shares a layer with.
            style={{ ...style, left: 0, top: 0, willChange: "transform", ...geometryMotion.style, x: shownX, y: shownY }}

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
                style={{ position: "absolute", visibility: minimized && presenceHidden ? "hidden" : "visible", top: insetTop, right: insetRight, bottom: insetBottom, left: insetLeft }}
            >
                <WindowSurface
                    surface={surfaceDefinition}
                    active={active}
                    floating
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

                    maximized={maximized}

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

                onDoubleClick={() => extendEdge(handle.edge)}

                className={`absolute touch-none ${handle.className}`}

            />)}

        </motion.div>

    </>
}

type WindowEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

/** The sides a resize from an edge or corner carries. */
function sidesOf(edge: WindowEdge): WindowSides {

    return { top: edge.includes("n"), right: edge.includes("e"), bottom: edge.includes("s"), left: edge.includes("w") }
}

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

    /**
     * Asks the view to go one whole view toward an edge the Window is held against, as
     * { x, y } of -1, 0 or 1. It answers how long the view takes to get there, or null when the
     * plane does not go on that way.
     */
    onEdgeHold?: (direction: Readonly<{ x: number, y: number }>) => number | null

    /** Where the other open standard Windows stand in this view, for reaching toward them. */
    neighbours?: () => readonly WindowRegion[]

    active?: boolean

    closing?: boolean

    /** The Process termination request has not settled yet. */
    stopping?: boolean

    minimized?: boolean

    maximized?: boolean

    /** Where a maximized Window's view starts, as shown: the whole view it is in, which is not always the one on screen. */
    maximizedPosition?: Position

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

    onPresentationMoveGesture?: (controller: DesktopMoveGestureController | null) => void

    /** Surface used only to decide which painted edges receive an inset. */
    paintSurfaceSize?: ViewSize

    /** Space kept from each edge of the Desktop when painting an edge that touches it. */
    paintMargins?: PaintMargins

    /** Appearance spacing shared by the layer boundary and tiled gaps. */
    spacing?: number

}

interface Gesture {

    origin: WindowRegion

    current: WindowRegion

    zone: Snap | null

    /** Held against an edge where the plane goes no further. */
    blocked?: boolean

    shown: Snap | null

    /** What the Window is painted inset by while the gesture lasts. */
    insets: PaintMargins
}

interface ActivePointerGesture {
    update(point: DesktopMovePoint): void
    end(point: DesktopMovePoint): void
    cancel(): void
}

interface ExternalMove {
    pointer: ActivePointerGesture
    finish: () => void
}

/**
 * Where a Window is shown: its own place, less the plane's glide while a hand holds it. It follows
 * every change at once, not on the next frame, so a Window and the plane it lives on are always
 * drawn from the same moment.
 */
function useHeldAgainst(place: MotionValue<number>, held: MotionValue<number>, glide: MotionValue<number> | undefined) {

    const shown = useMotionValue(place.get())

    useLayoutEffect(function () {

        const update = () => shown.set(place.get() - held.get() * (glide ? glide.get() : 0))

        update()

        const stops = [place, held, ...glide ? [glide] : []].map(value => value.on("change", update))

        return () => stops.forEach(stop => stop())

    }, [place, held, glide])

    return shown
}
