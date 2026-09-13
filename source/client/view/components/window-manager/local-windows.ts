import ClientState from "@client/core/link-manager/auth-manager/process-manager/client-state"
import {
    type AppearanceTransaction,
    type WaitedTransaction,
    type WindowGeometry,
    type WindowState
} from "@phreshos/core"
import { type LocalWindowHost, type LocalWindowState } from "../desktop-host/local-window"

export interface LocalWindowEntry {
    identity: string
    client: ClientState
}

/** Owns the representations of one desktop without entering server transport. */
export default class LocalWindows implements LocalWindowHost {

    public windows: ReadonlyMap<string, LocalWindowState>

    private readonly live = new Map<string, string>()
    private readonly authoritative = new Map<string, LocalWindowState>()
    private readonly waiting = new Map<string, WaitingAnimation>()
    private readonly readers = new Map<string, LocalGeometryReader>()
    private readonly following = new Map<string, FollowingWindow>()
    private revision = 0
    private changed: (windows: ReadonlyMap<string, LocalWindowState>) => void = () => undefined

    public constructor(initial: ReadonlyMap<string, LocalWindowEntry>, private readonly client: (process: string) => ClientState | null) {

        this.windows = new Map([...initial.values()].map(({ identity, client }) => [identity, localState(client)]))
        this.reconcile(initial)
    }

    public listen(changed: (windows: ReadonlyMap<string, LocalWindowState>) => void) {

        this.changed = changed
    }

    /** Following projects authoritative property changes, independent of Desktop layer. */
    public reconcile(current: ReadonlyMap<string, LocalWindowEntry>) {
        for (const [process, identity] of this.live) {
            if (current.get(process)?.identity === identity) continue
            this.cancel(identity, "geometry", "The local Window representation was removed")
            this.cancel(identity, "minimize", "The local Window representation was removed")
            this.cancel(identity, "surface", "The local Window representation was removed")
            this.following.delete(identity)
            this.authoritative.delete(identity)
        }

        this.live.clear()
        const next = new Map(this.windows)
        for (const [process, { identity, client }] of current) {
            this.live.set(process, identity)
            const snapshot = localState(client)
            if (!this.authoritative.has(identity) && client.window.layer === "window") {
                this.following.set(identity, { target: identity, snapshot })
            }
            if (!next.has(identity)) next.set(identity, snapshot)
            this.authoritative.set(identity, snapshot)
        }

        const alive = new Set(this.live.values())
        for (const [identity, relation] of this.following) {
            if (!alive.has(identity) || !alive.has(relation.target)) {
                this.following.delete(identity)
                continue
            }
            const state = next.get(identity)!
            const target = this.authoritative.get(relation.target)!
            const previous = relation.snapshot
            const changes: { -readonly [Key in keyof LocalWindowState]?: LocalWindowState[Key] } = {}
            for (const key of ["title", "position", "size", "minimized", "maximized", "depth"] as const) {
                if (JSON.stringify(previous[key]) !== JSON.stringify(target[key])) Object.assign(changes, { [key]: target[key] })
            }
            const maximized = changes.maximized ?? state.maximized
            const minimized = changes.minimized ?? state.minimized
            const geometryChanged = ("position" in changes && JSON.stringify(state.position) !== JSON.stringify(changes.position))
                || ("size" in changes && JSON.stringify(state.size) !== JSON.stringify(changes.size))
            if (maximized !== state.maximized || (!maximized && geometryChanged) || (minimized && !state.minimized)) {
                this.cancel(identity, "geometry", "The followed Window presentation changed")
                changes.geometryAnimation = null
            }
            if ("minimized" in changes && state.minimized !== changes.minimized) {
                this.cancel(identity, "minimize", "The followed Window visibility changed")
                changes.minimizeAnimation = null
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
        this.readers.delete(identity)
        this.authoritative.delete(identity)
        this.following.delete(identity)

        for (const [follower, relation] of this.following) if (relation.target === identity) this.following.delete(follower)

        this.publish(next)
    }

    public state(process: string) {

        const { identity, state } = this.existing(process)
        const geometry = this.readers.get(identity)?.()
        return windowState(state, frontmost(this.windows, state.layer) === identity, geometry)
    }

    /** Returns the values currently driving this desktop's representation. */
    public projection(process: string) {

        return this.existing(process).state
    }

    public readonly represent = (process: string, reader: LocalGeometryReader | null) => {

        const identity = this.live.get(process)

        if (!identity) return

        if (reader) this.readers.set(identity, reader)

        else this.readers.delete(identity)
    }

    public move(process: string, position: WindowState["position"], transaction?: RequestedTransaction) {

        const { identity, state } = this.existing(process)
        return this.changeGeometry(identity, { position, size: state.size }, transaction)
    }

    public resize(process: string, size: WindowState["size"], transaction?: RequestedTransaction) {

        const { identity, state } = this.existing(process)
        return this.changeGeometry(identity, { position: state.position, size }, transaction)
    }

    public geometry(process: string, value: WindowGeometry, transaction?: RequestedTransaction) {

        const { identity } = this.existing(process)
        return this.changeGeometry(identity, value, transaction)
    }

    public minimize(process: string, minimized: boolean, transaction?: RequestedTransaction) {

        const { identity } = this.existing(process)
        return this.changeMinimized(identity, minimized, transaction)
    }

    public maximize(process: string, maximized: boolean, transaction?: RequestedTransaction) {
        const { identity, state } = this.existing(process)
        if (state.maximized === maximized) return Promise.resolve()
        this.cancel(identity, "geometry")
        const animation = transaction && !state.minimized ? localAnimation(++this.revision, transaction) : null
        this.replace(identity, { ...state, maximized, geometryAnimation: animation })
        return this.waitFor(identity, "geometry", animation, transaction)
    }

    public follow(process: string, targetProcess: string, transaction?: RequestedTransaction) {
        const { identity } = this.existing(process)
        const target = this.existing(targetProcess)
        const snapshot = this.authoritative.get(target.identity)!
        this.following.set(identity, { target: target.identity, snapshot })
        const current = this.windows.get(identity)!
        const geometryChanged = JSON.stringify([current.position, current.size, current.maximized]) !== JSON.stringify([snapshot.position, snapshot.size, snapshot.maximized])
        const visibilityChanged = current.minimized !== snapshot.minimized
        this.cancel(identity, "geometry")
        this.cancel(identity, "minimize")
        const geometryAnimation = geometryChanged && !snapshot.minimized && transaction ? localAnimation(++this.revision, transaction) : null
        const minimizeAnimation = visibilityChanged && transaction ? localAnimation(++this.revision, transaction) : null
        this.replace(identity, {
            ...current,
            title: snapshot.title,
            position: snapshot.position,
            size: snapshot.size,
            minimized: snapshot.minimized,
            maximized: snapshot.maximized,
            depth: snapshot.depth,
            geometryAnimation,
            minimizeAnimation
        })
        return Promise.all([
            this.waitFor(identity, "geometry", geometryAnimation, transaction),
            this.waitFor(identity, "minimize", minimizeAnimation, transaction)
        ]).then(() => undefined)
    }

    public unfollow(process: string, _transaction?: RequestedTransaction) {
        const { identity } = this.existing(process)
        this.following.delete(identity)
        return Promise.resolve()
    }

    public title(process: string, title: string) {

        const { identity, state } = this.existing(process)
        this.replace(identity, { ...state, title })
    }

    public raise(process: string) {

        const { identity, state } = this.existing(process)
        if (frontmost(this.windows, state.layer) === identity) return
        const depth = [...this.windows.values()].reduce((highest, other) => other.layer === state.layer ? Math.max(highest, other.depth) : highest, 0)
        this.replace(identity, { ...state, depth: depth + 1 })
    }

    public addSurface(process: string, transaction?: RequestedTransaction) {

        const { identity, state } = this.existing(process)
        if (state.surface?.visible) return Promise.resolve()

        this.cancel(identity, "surface")
        const transition = transaction ? localAnimation(++this.revision, transaction) : null
        this.replace(identity, { ...state, surface: { visible: true, transition } })
        return this.waitFor(identity, "surface", transition, transaction)
    }

    public removeSurface(process: string, transaction?: RequestedTransaction) {

        const { identity, state } = this.existing(process)
        if (!state.surface || !state.surface.visible) return Promise.resolve()

        this.cancel(identity, "surface")
        const transition = transaction ? localAnimation(++this.revision, transaction) : null
        this.replace(identity, { ...state, surface: { visible: false, transition } })
        return this.waitFor(identity, "surface", transition, transaction)
    }

    public complete(process: string, kind: AnimationKind, revision: number) {

        const identity = this.live.get(process)
        if (!identity) return
        const state = this.windows.get(identity)
        const animation = kind === "geometry"
            ? state?.geometryAnimation
            : kind === "minimize"
                ? state?.minimizeAnimation
                : state?.surface?.transition
        if (!state || animation?.revision !== revision) return

        this.replace(identity, kind === "geometry"
            ? { ...state, geometryAnimation: null }
            : kind === "minimize"
                ? { ...state, minimizeAnimation: null }
                : { ...state, surface: state.surface?.visible ? { ...state.surface, transition: null } : null })

        const key = animationKey(identity, kind)
        const waiting = this.waiting.get(key)
        if (!waiting || waiting.revision !== revision) return
        this.waiting.delete(key)
        waiting.resolve()
    }

    /** A new iframe representation always begins from authoritative truth. */
    public release(process: string) {

        const identity = this.live.get(process)
        if (!identity) return
        this.cancel(identity, "geometry", "The local Window representation was removed")
        this.cancel(identity, "minimize", "The local Window representation was removed")
        this.cancel(identity, "surface", "The local Window representation was removed")

        const client = this.client(process)
        if (!client) return
        this.authoritative.set(identity, localState(client))
        this.following.delete(identity)
        if (client.window.layer === "window") this.following.set(identity, { target: identity, snapshot: localState(client) })
        this.replace(identity, localState(client))
    }

    private existing(process: string) {

        const identity = this.live.get(process)
        if (!identity) throw new Error("This Client has no local Window representation")
        const state = this.windows.get(identity)
        if (!state) throw new Error("This Client has no local Window representation")
        return { identity, state }
    }

    private replace(identity: string, state: LocalWindowState) {

        const next = new Map(this.windows)
        next.set(identity, state)
        this.publish(next)
    }

    private changeGeometry(identity: string, value: WindowGeometry, transaction?: RequestedTransaction) {

        const state = this.windows.get(identity)
        if (!state) throw new Error("This Client has no local Window representation")
        if (JSON.stringify([state.position, state.size]) === JSON.stringify([value.position, value.size])) return Promise.resolve()

        if (state.minimized || state.maximized) {
            this.replace(identity, { ...state, position: value.position, size: value.size })
            return Promise.resolve()
        }
        this.cancel(identity, "geometry")
        const animation = transaction ? localAnimation(++this.revision, transaction) : null
        this.replace(identity, { ...state, position: value.position, size: value.size, geometryAnimation: animation })
        return this.waitFor(identity, "geometry", animation, transaction)
    }

    private changeMinimized(identity: string, minimized: boolean, transaction?: RequestedTransaction) {

        const state = this.windows.get(identity)
        if (!state) throw new Error("This Client has no local Window representation")
        if (state.minimized === minimized) return Promise.resolve()

        this.cancel(identity, "minimize")
        if (minimized) this.cancel(identity, "geometry", "The local Window was minimized")
        const animation = transaction ? localAnimation(++this.revision, transaction) : null
        this.replace(identity, { ...state, minimized, minimizeAnimation: animation, geometryAnimation: minimized ? null : state.geometryAnimation })
        return this.waitFor(identity, "minimize", animation, transaction)
    }

    private publish(next: ReadonlyMap<string, LocalWindowState>) {

        this.windows = next
        this.changed(next)
    }

    private cancel(identity: string, kind: AnimationKind, reason = "The local Window animation was interrupted") {

        const key = animationKey(identity, kind)
        const waiting = this.waiting.get(key)
        if (!waiting) return
        this.waiting.delete(key)
        waiting.reject(new Error(reason))
    }

    private waitFor(identity: string, kind: AnimationKind, animation: LocalWindowState["geometryAnimation"], transaction?: RequestedTransaction) {

        if (!animation || !transaction || !("wait" in transaction)) return Promise.resolve()
        return new Promise<void>((resolve, reject) => {

            this.waiting.set(animationKey(identity, kind), { revision: animation.revision, resolve, reject })
        })
    }
}

type AnimationKind = "geometry" | "minimize" | "surface"
type RequestedTransaction = AppearanceTransaction | WaitedTransaction

interface WaitingAnimation {
    revision: number
    resolve: () => void
    reject: (error: Error) => void
}

interface FollowingWindow {
    target: string
    snapshot: LocalWindowState
}

function animationKey(identity: string, kind: AnimationKind) {

    return `${identity}:${kind}`
}

function baseTransaction(transaction: RequestedTransaction): AppearanceTransaction {

    return Object.freeze({ duration: transaction.duration, easing: transaction.easing })
}

function localAnimation(revision: number, transaction: RequestedTransaction) {

    return Object.freeze({ revision, transaction: baseTransaction(transaction) })
}

function localState(client: ClientState): LocalWindowState {

    const window = client.window
    return {
        title: window.title,
        position: window.position,
        size: window.size,
        minimized: window.minimized,
        maximized: window.maximized,
        front: false,
        layer: window.layer,
        depth: window.depth,
        surface: null,
        geometryAnimation: null,
        minimizeAnimation: null
    }
}

function windowState(local: LocalWindowState, front: boolean, geometry?: Readonly<{ position: WindowState["position"], size: WindowState["size"] }>): WindowState {

    return {
        title: local.title,
        position: geometry?.position ?? local.position,
        size: geometry?.size ?? local.size,
        minimized: local.minimized,
        maximized: local.maximized,
        front,
        layer: local.layer,
    }
}

export type LocalGeometryReader = () => Readonly<{
    position: WindowState["position"]
    size: WindowState["size"]
}>

function frontmost(windows: ReadonlyMap<string, LocalWindowState>, layer: LocalWindowState["layer"]) {

    let best: [string, LocalWindowState] | null = null
    for (const candidate of windows) {

        const [, window] = candidate
        if (window.layer !== layer || window.minimized) continue
        if (!best || best[1].depth <= window.depth) best = candidate
    }
    return best?.[0] ?? null
}
