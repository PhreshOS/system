import ClientState from "@client/core/link-manager/auth-manager/process-manager/client-state"
import type {
    Position,
    Size,
    WindowGeometry,
    WindowLayer,
    PresentationAnchor,
    PresentationGeometry,
    PresentationPosition,
    PresentationSize,
    PresentationSurface
} from "@phreshos/core"
import type {
    PresentationAnimation,
    DesktopMoveGestureController,
    DesktopMovePoint,
    PresentationTransactionRequest,
    PresentationState,
    PresentationHost
} from "../desktop-host/presentation"
import { resolveWindowGeometry, type WindowRegion } from "./window-geometry"
import { requireRawPresentation, requirePresentationMoveGesture, requireAnchorable } from "@shared/window-layers"

export interface PresentationEntry {
    identity: string
    client: ClientState
}

/** Values this Desktop currently uses to render one Client context. */
export interface PresentedWindow {
    title: string
    header: boolean
    surface: PresentationSurface
    position: Position
    size: Size
    minimized: boolean
    maximized: boolean
    interactive: boolean
    layer: WindowLayer
    /** What the drawing is fixed to: its position is counted from the viewport's center or the plane's. */
    anchor: PresentationAnchor
    depth: number
    surfaceAnimation: PresentationAnimation | null
    geometryAnimation: PresentationAnimation | null
    minimizeAnimation: PresentationAnimation | null
}

/**
 * A change this Desktop shows before the System confirms it: what a person did
 * here appears at once, and the System's truth replaces it when the request
 * settles, whether it was accepted or not.
 */
export interface AnticipatedWindow {
    minimized?: boolean
    maximized?: boolean
    front?: boolean
}

/** Owns only the local representations of one Desktop. */
export default class Presentations implements PresentationHost {
    public windows: ReadonlyMap<string, PresentedWindow>

    private readonly live = new Map<string, string>()
    private readonly waiting = new Map<string, WaitingAnimation>()
    private readonly representations = new Map<string, PresentationGeometryRepresentation>()
    private readonly moveGestureControllers = new Map<string, DesktopMoveGestureController>()
    private readonly moveGestures = new Map<string, ActiveMoveGesture>()
    private readonly anticipated = new Map<string, { change: AnticipatedWindow, pending: number }>()
    private readonly observers = new Set<() => void>()
    private readonly watching = new Map<string, () => void>()
    private fronts = 0
    private revision = 0
    /** How far this Desktop's view is moved across the plane, in pixels. */
    private offset = { x: 0, y: 0 }
    private changed: (windows: ReadonlyMap<string, PresentedWindow>) => void = () => undefined

    public constructor(initial: ReadonlyMap<string, PresentationEntry>, private readonly client: (process: string) => ClientState | null) {
        this.windows = new Map()
        this.reconcile(initial)
    }

    public listen(changed: (windows: ReadonlyMap<string, PresentedWindow>) => void) { this.changed = changed }

    public reconcile(current: ReadonlyMap<string, PresentationEntry>) {
        const previousLive = new Map(this.live)
        this.live.clear()
        const next = new Map(this.windows)

        for (const [process, identity] of previousLive) {
            if (current.get(process)?.identity === identity) continue
            next.delete(identity)
            this.release(identity, "The presentation was removed")
        }

        for (const [process, { identity, client }] of current) {
            this.live.set(process, identity)
            const existing = next.get(identity)
            if (!existing) next.set(identity, initialPresentationState(client))
            else if (existing.layer === "window") next.set(identity, followStandardWindow(existing, client, ++this.revision, this.anticipated.get(identity)?.change))
        }

        this.publish(next)
    }

    public remove(identity: string) {
        if (!this.windows.has(identity)) return
        const next = new Map(this.windows)
        next.delete(identity)
        this.release(identity, "The presentation was removed")
        this.publish(next)
    }

    /**
     * Shows a standard Window's change at once, while its request goes to the System. The change holds
     * until that request settles; then the Window follows the System again, which has either recorded
     * the same change or kept what it had.
     */
    public anticipate(process: string, change: AnticipatedWindow, request: Promise<unknown>) {
        const identity = this.live.get(process)
        const state = identity ? this.windows.get(identity) : null
        const client = this.client(process)
        if (!identity || !state || !client || state.layer !== "window") return
        // Changes made together hold together, until the last of their requests settles.
        const previous = this.anticipated.get(identity)
        const anticipated = { change: { ...previous?.change, ...change }, pending: (previous?.pending ?? 0) + 1 }
        // A Window brought forward stays above every Window the System has ranked until it answers.
        if (change.front) this.fronts++
        this.anticipated.set(identity, anticipated)
        this.replace(identity, followStandardWindow(state, client, ++this.revision, anticipated.change, this.fronts))
        request.catch(() => undefined).finally(() => {
            const held = this.anticipated.get(identity)
            if (!held || --held.pending > 0) return
            this.anticipated.delete(identity)
            const current = this.windows.get(identity)
            const live = this.client(process)
            if (current && live && current.layer === "window") this.replace(identity, followStandardWindow(current, live, ++this.revision))
        })
    }

    public projection(process: string) { return this.existing(process).state }

    /** Where this Desktop looks on the plane, in pixels, which drawings fixed to it are shown against. */
    public follow(offset: Readonly<{ x: number, y: number }>) {
        if (offset.x === this.offset.x && offset.y === this.offset.y) return
        this.offset = { x: offset.x, y: offset.y }
        this.notify()
    }

    /** Hears every change to what this Desktop draws, so a Client can learn how its own drawing changed. */
    public observe(listener: () => void) {
        this.observers.add(listener)
        return () => { this.observers.delete(listener) }
    }

    /**
     * How a Client is actually drawn: its frame, in pixels, counted from the center of the Desktop.
     * The Window's box is read where the Desktop draws it, and the frame's place inside the box from
     * the layout, so a scale the box is entering with does not change what is read.
     */
    public drawing(process: string, frame: HTMLIFrameElement): PresentationState {
        const { identity, state } = this.existing(process)
        const surface = frame.closest<HTMLElement>("[data-desktop-layers]")
        const width = surface?.offsetWidth ?? 0
        const height = surface?.offsetHeight ?? 0
        const box = this.representations.get(identity)?.read() ?? resolveWindowGeometry(state.position, state.size, { width, height })
        const inside = offsetWithin(frame, "[data-window-box]")
        // Counted from the center of what the drawing is fixed to: the viewport, or the plane.
        const from = state.anchor === "plane" ? this.offset : { x: 0, y: 0 }
        return {
            layer: state.layer,
            anchor: state.anchor,
            position: { x: box.x + inside.x - width / 2 + from.x, y: box.y + inside.y - height / 2 + from.y },
            size: { width: frame.offsetWidth, height: frame.offsetHeight },
            front: frontmost(this.windows, state.layer) === identity,
            interactive: state.interactive,
            surface: state.surface
        }
    }

    public readonly represent = (process: string, representation: PresentationGeometryRepresentation | null) => {
        const identity = this.live.get(process)
        if (!identity) return
        this.unrepresent(identity)
        if (representation) {
            this.representations.set(identity, representation)
            // A drawing moves with its box at every step, so its Client hears where it is as it goes.
            this.watching.set(identity, representation.watch(() => this.notify()))
        }
        this.publish(new Map(this.windows))
    }

    public readonly registerMoveGesture = (process: string, controller: DesktopMoveGestureController | null) => {
        const identity = this.live.get(process)
        if (!identity) return
        if (this.moveGestureControllers.get(identity) === controller) return
        this.cancelIdentityMoveGestures(identity)
        if (controller) this.moveGestureControllers.set(identity, controller)
        else this.moveGestureControllers.delete(identity)
    }

    public beginMoveGesture(process: string, gesture: string, origin: DesktopMovePoint, point: DesktopMovePoint) {
        const { identity, state } = this.existing(process)
        requirePresentationMoveGesture(state.layer)
        if ([...this.moveGestures.values()].some(active => active.identity === identity)) throw new Error("This Window already has an active move gesture")
        const controller = this.moveGestureControllers.get(identity)
        if (!controller) throw new Error("This Window cannot currently begin a move gesture")
        const movement = controller.begin(origin, point)
        const active = { identity, movement }
        this.moveGestures.set(gesture, active)
        void movement.finished.catch(() => undefined)
        return movement.ready.catch(error => {
            if (this.moveGestures.get(gesture) === active) this.moveGestures.delete(gesture)
            throw error
        })
    }

    public async waitMoveGesture(process: string, gesture: string) {
        const active = this.moveGesture(process, gesture)
        try { await active.movement.finished }
        finally {
            if (this.moveGestures.get(gesture) === active) this.moveGestures.delete(gesture)
        }
    }

    // Positions travel from the Client document as they come; one that arrives after its move ended,
    // or for a move of another Window, has nothing left to move.
    public continueMoveGesture(process: string, gesture: string, point: DesktopMovePoint) {
        const active = this.moveGestures.get(gesture)
        if (active && active.identity === this.live.get(process)) active.movement.move(point)
    }

    public endMoveGesture(process: string, gesture: string, point: DesktopMovePoint) {
        const active = this.moveGestures.get(gesture)
        if (active && active.identity === this.live.get(process)) active.movement.end(point)
    }

    public cancelMoveGesture(process: string, gesture: string) {
        const active = this.moveGesture(process, gesture)
        this.moveGestures.delete(gesture)
        active.movement.cancel()
    }

    public cancelMoveGestures(process: string) {
        const identity = this.live.get(process)
        if (identity) this.cancelIdentityMoveGestures(identity)
    }

    public representedGeometry(process: string) {
        const identity = this.live.get(process)
        return identity ? this.representations.get(identity)?.read() ?? null : null
    }

    public presentGeometry(process: string, geometry: WindowRegion) {
        const identity = this.live.get(process)
        const representation = identity ? this.representations.get(identity) : null
        if (!representation) return false
        representation.present(geometry)
        return true
    }

    public beginGeometry(process: string) {
        const identity = this.live.get(process)
        return identity ? this.representations.get(identity)?.begin() ?? null : null
    }

    public finishGeometry(process: string) {
        const identity = this.live.get(process)
        if (identity) this.representations.get(identity)?.finish()
    }

    public cancelGeometry(process: string) {
        const identity = this.live.get(process)
        if (identity) this.representations.get(identity)?.cancel()
    }

    public move(process: string, position: PresentationPosition, transaction?: PresentationTransactionRequest) {
        const { identity, state } = this.raw(process)
        return this.changeGeometry(identity, { ...position, ...state.size }, transaction)
    }

    public resize(process: string, size: PresentationSize, transaction?: PresentationTransactionRequest) {
        const { identity, state } = this.raw(process)
        return this.changeGeometry(identity, { ...state.position, ...size }, transaction)
    }

    public setGeometry(process: string, geometry: PresentationGeometry, transaction?: PresentationTransactionRequest) {
        const { identity } = this.raw(process)
        return this.changeGeometry(identity, geometry, transaction)
    }

    public setSurface(process: string, surface: PresentationSurface, transaction?: PresentationTransactionRequest) {
        const { identity, state } = this.raw(process)
        if (JSON.stringify(state.surface) === JSON.stringify(surface)) return Promise.resolve()
        this.cancel(identity, "surface")
        const animation = this.animation(transaction)
        this.replace(identity, { ...state, surface, surfaceAnimation: animation })
        return this.waitFor(identity, "surface", animation, transaction)
    }

    public setInteractive(process: string, interactive: boolean) {
        const { identity, state } = this.raw(process)
        if (state.interactive === interactive) return
        this.replace(identity, { ...state, interactive })
    }

    /**
     * Fixes a drawing to the viewport or to the plane. It stays where it is in the viewport: its position
     * is counted again from the center of what it is now fixed to, so nothing moves.
     */
    public setAnchor(process: string, anchor: PresentationAnchor) {
        const { identity, state } = this.raw(process)
        requireAnchorable(state.layer)
        if (state.anchor === anchor) return
        const shift = anchor === "plane" ? 1 : -1
        const position = state.position as PresentationPosition
        this.replace(identity, { ...state, anchor, position: { x: position.x + shift * this.offset.x, y: position.y + shift * this.offset.y } })
    }

    public raise(process: string) {
        const { identity, state } = this.raw(process)
        if (frontmost(this.windows, state.layer) === identity) return
        const depth = [...this.windows.values()].reduce((highest, other) => other.layer === state.layer ? Math.max(highest, other.depth) : highest, 0)
        this.replace(identity, { ...state, depth: depth + 1 })
    }

    public complete(process: string, kind: AnimationKind, revision: number) {
        const identity = this.live.get(process)
        const state = identity ? this.windows.get(identity) : null
        const animation = kind === "geometry"
            ? state?.geometryAnimation
            : kind === "surface"
                ? state?.surfaceAnimation
                : state?.minimizeAnimation
        if (!identity || !state || animation?.revision !== revision) return
        this.replace(identity, kind === "geometry"
            ? { ...state, geometryAnimation: null }
            : kind === "surface"
                ? { ...state, surfaceAnimation: null }
                : { ...state, minimizeAnimation: null })
        const key = animationKey(identity, kind)
        const waiting = this.waiting.get(key)
        if (!waiting || waiting.revision !== revision) return
        this.waiting.delete(key)
        waiting.resolve()
    }

    /** A newly mounted iframe always begins from its layer's ownership rule. */
    public begin(process: string) {
        const identity = this.live.get(process)
        const client = this.client(process)
        if (!identity || !client) return

        const state = this.windows.get(identity)
        if (!state) return

        if (state.layer === "window") {
            // A document owns only gestures it originated. Standard Window
            // geometry belongs to the Desktop and must survive iframe load.
            this.cancelIdentityMoveGestures(identity)
            return
        }

        this.releaseTransient(identity, "The presentation was replaced")
        this.replace(identity, initialPresentationState(client))
    }

    private raw(process: string) {
        const found = this.existing(process)
        requireRawPresentation(found.state.layer)
        return found
    }

    private existing(process: string) {
        const identity = this.live.get(process)
        const state = identity ? this.windows.get(identity) : null
        if (!identity || !state) throw new Error("This Client has no presentation")
        return { identity, state }
    }

    private replace(identity: string, state: PresentedWindow) {
        const next = new Map(this.windows)
        next.set(identity, state)
        this.publish(next)
    }

    private moveGesture(process: string, gesture: string) {
        const { identity } = this.existing(process)
        const active = this.moveGestures.get(gesture)
        if (!active || active.identity !== identity) throw new Error("This Window move gesture does not exist")
        return active
    }

    private cancelIdentityMoveGestures(identity: string) {
        for (const [gesture, active] of this.moveGestures) {
            if (active.identity !== identity) continue
            this.moveGestures.delete(gesture)
            active.movement.cancel()
        }
    }

    private changeGeometry(identity: string, value: WindowGeometry, transaction?: PresentationTransactionRequest) {
        const state = this.windows.get(identity)
        if (!state) throw new Error("This Client has no presentation")
        const position = { x: value.x, y: value.y }
        const size = { width: value.width, height: value.height }
        if (JSON.stringify([state.position, state.size]) === JSON.stringify([position, size])) return Promise.resolve()
        this.cancel(identity, "geometry")
        const animation = this.animation(transaction)
        this.replace(identity, { ...state, position, size, geometryAnimation: animation })
        return this.waitFor(identity, "geometry", animation, transaction)
    }

    private animation(request?: PresentationTransactionRequest): PresentationAnimation | null {
        if (!request) return null
        return Object.freeze({ revision: ++this.revision, ...request.transaction === undefined ? {} : { transaction: request.transaction } })
    }

    private publish(next: ReadonlyMap<string, PresentedWindow>) {
        this.windows = next
        this.changed(next)
        this.notify()
    }

    private notify() {
        for (const observer of this.observers) observer()
    }

    private unrepresent(identity: string) {
        this.watching.get(identity)?.()
        this.watching.delete(identity)
        this.representations.delete(identity)
    }

    private cancel(identity: string, kind: AnimationKind, reason = "The presentation transaction was interrupted") {
        const key = animationKey(identity, kind)
        const waiting = this.waiting.get(key)
        if (!waiting) return
        this.waiting.delete(key)
        waiting.reject(new Error(reason))
    }

    private waitFor(identity: string, kind: AnimationKind, animation: PresentationAnimation | null, transaction?: PresentationTransactionRequest) {
        if (!animation || !transaction?.wait) return Promise.resolve()
        return new Promise<void>((resolve, reject) => {
            this.waiting.set(animationKey(identity, kind), { revision: animation.revision, resolve, reject })
        })
    }

    private releaseTransient(identity: string, reason: string) {
        this.cancel(identity, "geometry", reason)
        this.cancel(identity, "surface", reason)
        this.cancelIdentityMoveGestures(identity)
    }

    private release(identity: string, reason: string) {
        this.releaseTransient(identity, reason)
        // The geometry representation belongs to the mounted Desktop Window,
        // not to an iframe document that may be replaced inside it.
        this.unrepresent(identity)
        this.moveGestureControllers.delete(identity)
    }
}

interface ActiveMoveGesture {
    identity: string
    movement: ReturnType<DesktopMoveGestureController["begin"]>
}

type AnimationKind = "geometry" | "surface" | "minimize"

interface WaitingAnimation {
    revision: number
    resolve: () => void
    reject: (error: Error) => void
}

function animationKey(identity: string, kind: AnimationKind) { return `${identity}:${kind}` }

function initialPresentationState(client: ClientState): PresentedWindow {
    const window = client.window
    const layer = window.layer
    if (layer === "window") return {
        title: window.title,
        header: window.header,
        surface: true,
        position: window.position,
        size: window.size,
        minimized: window.minimized,
        maximized: window.maximized,
        interactive: true,
        layer,
        anchor: "plane",
        depth: window.depth,
        surfaceAnimation: null,
        geometryAnimation: null,
        minimizeAnimation: null
    }
    if (layer === "wallpaper") return {
        title: window.title,
        header: false,
        surface: false,
        position: { x: "-1/2", y: "-1/2" },
        size: { width: "1/1", height: "1/1" },
        minimized: false,
        maximized: true,
        interactive: true,
        layer,
        anchor: "viewport",
        depth: 0,
        surfaceAnimation: null,
        geometryAnimation: null,
        minimizeAnimation: null
    }
    // Raw layers deliberately do not interpret the authoritative Window even
    // on first mount. Program code must explicitly build its local projection.
    return {
        title: window.title,
        header: false,
        surface: false,
        position: { x: 0, y: 0 },
        size: { width: 0, height: 0 },
        minimized: false,
        maximized: false,
        interactive: true,
        layer,
        anchor: "viewport",
        depth: window.depth,
        surfaceAnimation: null,
        geometryAnimation: null,
        minimizeAnimation: null
    }
}

/** Anticipated fronts rank above every depth the System assigns. */
const anticipatedFront = 1_000_000_000

function followStandardWindow(current: PresentedWindow, client: ClientState, revision: number, anticipated?: AnticipatedWindow, fronts = 0): PresentedWindow {
    const recorded = client.window
    const window = {
        position: recorded.position,
        size: recorded.size,
        title: recorded.title,
        header: recorded.header,
        minimized: anticipated?.minimized ?? recorded.minimized,
        maximized: anticipated?.maximized ?? recorded.maximized,
        depth: anticipated?.front ? Math.max(current.depth, anticipatedFront + fronts) : recorded.depth
    }
    const geometryChanged = JSON.stringify([current.position, current.size]) !== JSON.stringify([window.position, window.size])
    const maximizedChanged = current.maximized !== window.maximized
    const minimizedChanged = current.minimized !== window.minimized
    return {
        ...current,
        title: window.title,
        header: window.header,
        position: window.position,
        size: window.size,
        minimized: window.minimized,
        maximized: window.maximized,
        depth: window.depth,
        // Maximization changes the Desktop-owned projection without changing
        // the authoritative position or size, so it still needs geometry motion.
        geometryAnimation: (geometryChanged || maximizedChanged) && !window.minimized
            ? { revision }
            : current.geometryAnimation,
        minimizeAnimation: minimizedChanged
            ? { revision }
            : current.minimizeAnimation
    }
}

export interface PresentationGeometryRepresentation {
    read: () => WindowRegion
    watch: (listener: () => void) => () => void
    present: (geometry: WindowRegion) => void
    begin: () => WindowRegion | null
    finish: () => void
    cancel: () => void
}

/** Where an element sits inside the nearest ancestor matching a selector, by layout alone. */
function offsetWithin(element: HTMLElement, boundary: string) {
    let x = 0
    let y = 0
    for (let current: HTMLElement | null = element; current && !current.matches(boundary); current = current.offsetParent as HTMLElement | null) {
        x += current.offsetLeft
        y += current.offsetTop
    }
    return { x, y }
}

function frontmost(windows: ReadonlyMap<string, PresentedWindow>, layer: WindowLayer) {
    let best: [string, PresentedWindow] | null = null
    for (const candidate of windows) {
        const [, window] = candidate
        if (window.layer !== layer || window.minimized) continue
        if (!best || best[1].depth <= window.depth) best = candidate
    }
    return best?.[0] ?? null
}
