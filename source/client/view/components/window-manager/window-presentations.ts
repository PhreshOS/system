import { followedState, requirePresentationMutation } from "./layer-policy"
import ClientState from "@client/core/link-manager/auth-manager/process-manager/client-state"
import {
    type WindowSurface,
    type WindowGeometry,
    type WindowState
} from "@phreshos/core"
import { type PresentationTransactionRequest, type WindowPresentationHost, type WindowPresentationState } from "../desktop-host/window-presentation"
import { type WindowRegion } from "./window-geometry"
import { isFixedWindowPresentationLayer, requireWindowPresentationRead, supportsWindowPresentationApplication } from "@shared/window-layers"

export interface WindowPresentationEntry {
    identity: string
    client: ClientState
}

/** Owns the representations of one desktop without entering server transport. */
export default class WindowPresentations implements WindowPresentationHost {

    public windows: ReadonlyMap<string, WindowPresentationState>

    private readonly live = new Map<string, string>()
    private readonly authoritative = new Map<string, WindowPresentationState>()
    private readonly waiting = new Map<string, WaitingAnimation>()
    private readonly representations = new Map<string, PresentationGeometryRepresentation>()
    private readonly following = new Map<string, FollowingWindow>()
    private readonly observers = new Map<string, Set<(event: string, value: unknown) => void>>()
    private readonly emitted = new Map<string, WindowState>()
    private revision = 0
    private changed: (windows: ReadonlyMap<string, WindowPresentationState>) => void = () => undefined

    public constructor(initial: ReadonlyMap<string, WindowPresentationEntry>, private readonly client: (process: string) => ClientState | null) {

        this.windows = new Map([...initial.values()].map(({ identity, client }) => [identity, initialPresentationState(client)]))
        for (const [identity, state] of this.windows) this.emitted.set(identity, windowState(state, frontmost(this.windows, state.layer) === identity))
        this.reconcile(initial)
    }

    public listen(changed: (windows: ReadonlyMap<string, WindowPresentationState>) => void) {

        this.changed = changed
    }

    /** Following projects the authoritative properties owned by the receiving layer. */
    public reconcile(current: ReadonlyMap<string, WindowPresentationEntry>) {
        for (const [process, identity] of this.live) {
            if (current.get(process)?.identity === identity) continue
            this.cancel(identity, "geometry", "The Window presentation was removed")
            this.cancel(identity, "minimize", "The Window presentation was removed")
            this.cancel(identity, "surface", "The Window presentation was removed")
            this.following.delete(identity)
            this.authoritative.delete(identity)
        }

        this.live.clear()
        const next = new Map(this.windows)
        for (const [process, { identity, client }] of current) {
            this.live.set(process, identity)
            const snapshot = authoritativeState(client)
            if (!this.authoritative.has(identity) && client.window.layer === "window") {
                this.following.set(identity, { snapshot })
            }
            if (!next.has(identity)) next.set(identity, initialPresentationState(client))
            else next.set(identity, { ...next.get(identity)!, transaction: snapshot.transaction })
            this.authoritative.set(identity, snapshot)
        }

        const alive = new Set(this.live.values())
        for (const [identity, relation] of this.following) {
            if (!alive.has(identity)) {
                this.following.delete(identity)
                continue
            }
            const state = next.get(identity)!
            const target = this.authoritative.get(identity)!
            const previous = relation.snapshot
            const changes = { transaction: target.transaction, depth: target.depth, ...followedState(state, target, previous) }
            const maximized = changes.maximized ?? state.maximized
            const minimized = changes.minimized ?? state.minimized
            const geometryChanged = ("position" in changes && JSON.stringify(state.position) !== JSON.stringify(changes.position))
                || ("size" in changes && JSON.stringify(state.size) !== JSON.stringify(changes.size))
            if (maximized !== state.maximized || (!maximized && geometryChanged) || (minimized && !state.minimized)) {
                this.cancel(identity, "geometry", "The followed Window presentation changed")
                const target = { ...state, ...changes }
                changes.geometryAnimation = minimized
                    ? null
                    : presentationAnimation(++this.revision, defaultPresentationTransaction(target))
            }
            if ("minimized" in changes && state.minimized !== changes.minimized) {
                this.cancel(identity, "minimize", "The followed Window visibility changed")
                const target = { ...state, ...changes }
                changes.minimizeAnimation = presentationAnimation(++this.revision, defaultPresentationTransaction(target))
            }
            next.set(identity, { ...state, ...changes })
            relation.snapshot = target
        }
        this.publish(next)
    }

    public remove(identity: string) {

        if (!this.windows.has(identity)) return
        const next = new Map(this.windows)
        next.delete(identity)
        this.removeRepresentation(identity)
        this.authoritative.delete(identity)
        this.following.delete(identity)
        this.observers.delete(identity)
        this.emitted.delete(identity)

        this.publish(next)
    }

    public state(process: string) {

        const { identity, state } = this.existing(process)
        return windowState(state, frontmost(this.windows, state.layer) === identity)
    }

    public read(process: string, property: import("@shared/window-layers").WindowPresentationProperty) {
        const { state } = this.existing(process)
        requireWindowPresentationRead(state.layer, property)
        return this.state(process)[property]
    }

    /** Returns the values currently driving this desktop's representation. */
    public projection(process: string) {

        return this.existing(process).state
    }

    public readonly represent = (process: string, representation: PresentationGeometryRepresentation | null) => {

        const identity = this.live.get(process)

        if (!identity) return

        this.removeRepresentation(identity)

        if (representation) {

            this.representations.set(identity, representation)
        }

        this.publish(new Map(this.windows))
    }

    public representedGeometry(process: string) {

        const identity = this.live.get(process)

        return identity ? this.representations.get(identity)?.read() ?? null : null
    }

    public presentGeometry(process: string, geometry: WindowRegion) {

        const identity = this.live.get(process)

        if (!identity) return false

        const representation = this.representations.get(identity)

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

    public move(process: string, position: WindowState["position"], transaction?: PresentationTransactionRequest) {

        const { identity, state } = this.existing(process)
        requirePresentationMutation(state.layer, "position")
        return this.changeGeometry(identity, { ...position, ...state.size }, transaction)
    }

    public resize(process: string, size: WindowState["size"], transaction?: PresentationTransactionRequest) {

        const { identity, state } = this.existing(process)
        requirePresentationMutation(state.layer, "size")
        return this.changeGeometry(identity, { ...state.position, ...size }, transaction)
    }

    public setGeometry(process: string, value: WindowGeometry, transaction?: PresentationTransactionRequest) {

        const { identity, state } = this.existing(process)
        requirePresentationMutation(state.layer, "position")
        return this.changeGeometry(identity, value, transaction)
    }

    public minimize(process: string, minimized: boolean, transaction?: PresentationTransactionRequest) {

        const { identity, state } = this.existing(process)
        requirePresentationMutation(state.layer, "minimized")
        return this.changeMinimized(identity, minimized, transaction)
    }

    public maximize(process: string, maximized: boolean, transaction?: PresentationTransactionRequest) {
        const { identity, state } = this.existing(process)
        requirePresentationMutation(state.layer, "maximized")
        if (state.maximized === maximized) return Promise.resolve()
        this.cancel(identity, "geometry")
        const animation = !state.minimized ? presentationAnimation(++this.revision, defaultPresentationTransaction(state), transaction) : null
        this.replace(identity, { ...state, maximized, geometryAnimation: animation })
        return this.waitFor(identity, "geometry", animation, transaction)
    }

    public follow(process: string, transaction?: PresentationTransactionRequest) {
        // Following is an intersection with the current layer's capabilities;
        // an empty intersection is a successful no-op, never a layer error.
        const { identity } = this.existing(process)
        const snapshot = this.authoritative.get(identity)!
        this.following.set(identity, { snapshot })
        const current = this.windows.get(identity)!
        const projected = { ...current, ...followedState(current, snapshot) }
        const geometryChanged = JSON.stringify([current.position, current.size, current.maximized]) !== JSON.stringify([projected.position, projected.size, projected.maximized])
        const visibilityChanged = current.minimized !== projected.minimized
        this.cancel(identity, "geometry")
        this.cancel(identity, "minimize")
        const selectedTransaction = defaultPresentationTransaction(projected)
        const geometryAnimation = geometryChanged && !projected.minimized ? presentationAnimation(++this.revision, selectedTransaction, transaction) : null
        const minimizeAnimation = visibilityChanged ? presentationAnimation(++this.revision, selectedTransaction, transaction) : null
        this.replace(identity, {
            ...projected,
            geometryAnimation,
            minimizeAnimation
        })
        return Promise.all([
            this.waitFor(identity, "geometry", geometryAnimation, transaction),
            this.waitFor(identity, "minimize", minimizeAnimation, transaction)
        ]).then(() => undefined)
    }

    public unfollow(process: string) {
        const { identity } = this.existing(process)
        this.following.delete(identity)
        return Promise.resolve()
    }

    public setTitle(process: string, title: string) {

        const { identity, state } = this.existing(process)
        requirePresentationMutation(state.layer, "title")
        this.replace(identity, { ...state, title })
    }

    public setHeader(process: string, header: boolean) {

        const { identity, state } = this.existing(process)
        requirePresentationMutation(state.layer, "header")
        if (state.header === header) return
        this.replace(identity, { ...state, header })
    }

    public raise(process: string) {

        const { identity, state } = this.existing(process)
        requirePresentationMutation(state.layer, "front")
        if (frontmost(this.windows, state.layer) === identity) return
        const depth = [...this.windows.values()].reduce((highest, other) => other.layer === state.layer ? Math.max(highest, other.depth) : highest, 0)
        this.replace(identity, { ...state, depth: depth + 1 })
    }

    public observe(process: string, event: string | null, listener: (event: string, value: unknown) => void) {

        const { identity } = this.existing(process)
        const listeners = this.observers.get(identity) ?? new Set()
        const selected = (emitted: string, value: unknown) => {
            if (event === null || event === emitted) listener(emitted, value)
        }
        listeners.add(selected)
        this.observers.set(identity, listeners)

        return () => {
            listeners.delete(selected)
            if (!listeners.size) this.observers.delete(identity)
        }
    }

    public setSurface(process: string, surface: WindowSurface, transaction?: PresentationTransactionRequest) {

        const { identity, state } = this.existing(process)
        requirePresentationMutation(state.layer, "surface")
        if (JSON.stringify(state.surface) === JSON.stringify(surface)) return Promise.resolve()

        this.cancel(identity, "surface")
        const animation = presentationAnimation(++this.revision, defaultPresentationTransaction(state), transaction)
        this.replace(identity, { ...state, surface, surfaceAnimation: animation })
        return this.waitFor(identity, "surface", animation, transaction)
    }

    public complete(process: string, kind: AnimationKind, revision: number) {

        const identity = this.live.get(process)
        if (!identity) return
        const state = this.windows.get(identity)
        const animation = kind === "geometry"
            ? state?.geometryAnimation
            : kind === "minimize"
                ? state?.minimizeAnimation
                : state?.surfaceAnimation
        if (!state || animation?.revision !== revision) return

        this.replace(identity, kind === "geometry"
            ? { ...state, geometryAnimation: null }
            : kind === "minimize"
                ? { ...state, minimizeAnimation: null }
                : { ...state, surfaceAnimation: null })

        const key = animationKey(identity, kind)
        const waiting = this.waiting.get(key)
        if (!waiting || waiting.revision !== revision) return
        this.waiting.delete(key)
        waiting.resolve()
    }

    /** A new iframe representation always begins from authoritative truth. */
    public begin(process: string) {

        const identity = this.live.get(process)
        if (!identity) return
        this.cancel(identity, "geometry", "The Window presentation was removed")
        this.cancel(identity, "minimize", "The Window presentation was removed")
        this.cancel(identity, "surface", "The Window presentation was removed")

        const client = this.client(process)
        if (!client) return
        this.authoritative.set(identity, authoritativeState(client))
        this.following.delete(identity)
        if (client.window.layer === "window") this.following.set(identity, { snapshot: authoritativeState(client) })
        this.replace(identity, initialPresentationState(client))
    }

    private existing(process: string) {

        const identity = this.live.get(process)
        if (!identity) throw new Error("This Client has no Window presentation")
        const state = this.windows.get(identity)
        if (!state) throw new Error("This Client has no Window presentation")
        return { identity, state }
    }

    private replace(identity: string, state: WindowPresentationState) {

        const next = new Map(this.windows)
        next.set(identity, state)
        this.publish(next)
    }

    private removeRepresentation(identity: string) {

        this.representations.delete(identity)
    }

    private changeGeometry(identity: string, value: WindowGeometry, transaction?: PresentationTransactionRequest) {

        const state = this.windows.get(identity)
        if (!state) throw new Error("This Client has no Window presentation")
        const position = { x: value.x, y: value.y }
        const size = { width: value.width, height: value.height }
        if (JSON.stringify([state.position, state.size]) === JSON.stringify([position, size])) return Promise.resolve()

        if (state.minimized || state.maximized) {
            this.replace(identity, { ...state, position, size })
            return Promise.resolve()
        }
        this.cancel(identity, "geometry")
        const animation = presentationAnimation(++this.revision, defaultPresentationTransaction(state), transaction)
        this.replace(identity, { ...state, position, size, geometryAnimation: animation })
        return this.waitFor(identity, "geometry", animation, transaction)
    }

    private changeMinimized(identity: string, minimized: boolean, transaction?: PresentationTransactionRequest) {

        const state = this.windows.get(identity)
        if (!state) throw new Error("This Client has no Window presentation")
        if (state.minimized === minimized) return Promise.resolve()

        this.cancel(identity, "minimize")
        if (minimized) this.cancel(identity, "geometry", "The Window presentation was minimized")
        const animation = presentationAnimation(++this.revision, defaultPresentationTransaction(state), transaction)
        this.replace(identity, { ...state, minimized, minimizeAnimation: animation, geometryAnimation: minimized ? null : state.geometryAnimation })
        return this.waitFor(identity, "minimize", animation, transaction)
    }

    private publish(next: ReadonlyMap<string, WindowPresentationState>) {

        this.windows = next
        this.emitPresentationEvents()
        this.changed(next)
    }

    private emitPresentationEvents() {

        for (const [identity, presentation] of this.windows) {
            // Renderer measurements are private output. Presentation events expose
            // the values the Desktop relies on, so maximize and animation cannot
            // rewrite or continuously reinterpret the retained geometry.
            const current = windowState(presentation, frontmost(this.windows, presentation.layer) === identity)
            const previous = this.emitted.get(identity)
            this.emitted.set(identity, current)
            if (!previous) continue

            const emit = (property: import("@shared/window-layers").WindowPresentationProperty, event: string, value: unknown) => {
                if (!supportsWindowPresentationApplication(presentation.layer, property)) return
                for (const listener of this.observers.get(identity) ?? []) listener(event, value)
            }

            const moved = JSON.stringify(previous.position) !== JSON.stringify(current.position)
            const resized = JSON.stringify(previous.size) !== JSON.stringify(current.size)
            if (moved) emit("position", "move", current.position)
            if (resized) emit("size", "resize", current.size)
            if (previous.minimized !== current.minimized) emit("minimized", "minimize", current.minimized)
            if (previous.maximized !== current.maximized) emit("maximized", "maximize", current.maximized)
            if (previous.title !== current.title) emit("title", "changeTitle", current.title)
            if (previous.header !== current.header) emit("header", "changeHeader", current.header)
            if (JSON.stringify(previous.surface) !== JSON.stringify(current.surface)) emit("surface", "changeSurface", current.surface)
            if (previous.front !== current.front) emit("front", "front", current.front)
        }
    }

    private cancel(identity: string, kind: AnimationKind, reason = "The Window presentation transaction was interrupted") {

        const key = animationKey(identity, kind)
        const waiting = this.waiting.get(key)
        if (!waiting) return
        this.waiting.delete(key)
        waiting.reject(new Error(reason))
    }

    private waitFor(identity: string, kind: AnimationKind, animation: WindowPresentationState["geometryAnimation"], transaction?: PresentationTransactionRequest) {

        if (!animation || !transaction?.wait) return Promise.resolve()
        return new Promise<void>((resolve, reject) => {

            this.waiting.set(animationKey(identity, kind), { revision: animation.revision, resolve, reject })
        })
    }
}

type AnimationKind = "geometry" | "minimize" | "surface"

interface WaitingAnimation {
    revision: number
    resolve: () => void
    reject: (error: Error) => void
}

interface FollowingWindow {
    snapshot: WindowPresentationState
}

function animationKey(identity: string, kind: AnimationKind) {

    return `${identity}:${kind}`
}

function presentationAnimation(revision: number, fallback: WindowState["transaction"], request?: PresentationTransactionRequest) {

    const transaction = request?.transaction === undefined || request.transaction === true
        ? fallback
        : request.transaction
    return transaction === false ? null : Object.freeze({ revision, transaction })
}

function defaultPresentationTransaction(state: Pick<WindowPresentationState, "layer" | "transaction">) {
    return state.transaction
}

function initialPresentationState(client: ClientState): WindowPresentationState {

    const window = client.window
    const fixed = isFixedWindowPresentationLayer(window.layer)
    return {
        ...authoritativeState(client),
        title: window.title,
        header: window.layer === "window" ? window.header : false,
        surface: fixed ? false : window.surface,
        position: fixed ? { x: 0, y: 0 } : window.position,
        size: fixed ? { width: "100%", height: "100%" } : window.size,
        minimized: fixed ? false : window.minimized,
        maximized: fixed ? true : window.maximized,
        depth: fixed ? 0 : window.depth,
        surfaceAnimation: null,
    }
}

function authoritativeState(client: ClientState): WindowPresentationState {
    const window = client.window
    return {
        title: window.title,
        header: window.header,
        surface: window.surface,
        transaction: window.transaction,
        position: window.position,
        size: window.size,
        minimized: window.minimized,
        maximized: window.maximized,
        front: false,
        layer: window.layer,
        depth: window.depth,
        surfaceAnimation: null,
        geometryAnimation: null,
        minimizeAnimation: null
    }
}

function windowState(local: WindowPresentationState, front: boolean): WindowState {

    return {
        title: local.title,
        header: local.header,
        surface: local.surface,
        transaction: local.transaction,
        position: local.position,
        size: local.size,
        minimized: local.minimized,
        maximized: local.maximized,
        front,
        layer: local.layer,
    }
}

export interface PresentationGeometryRepresentation {

    read: () => WindowRegion

    present: (geometry: WindowRegion) => void

    begin: () => WindowRegion | null

    finish: () => void

    cancel: () => void
}

function frontmost(windows: ReadonlyMap<string, WindowPresentationState>, layer: WindowPresentationState["layer"]) {

    let best: [string, WindowPresentationState] | null = null
    for (const candidate of windows) {

        const [, window] = candidate
        if (window.layer !== layer || window.minimized) continue
        if (!best || best[1].depth <= window.depth) best = candidate
    }
    return best?.[0] ?? null
}
