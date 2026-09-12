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
    private readonly authoritative = new Map<string, string>()
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

    /** Projects new authority only where the ordinary Window layer delegates it. */
    public reconcile(current: ReadonlyMap<string, LocalWindowEntry>) {

        for (const [process, identity] of this.live) {

            if (current.get(process)?.identity === identity) continue

            this.cancel(identity, "geometry", "The local Window representation was removed")

            this.cancel(identity, "minimize", "The local Window representation was removed")

            this.cancel(identity, "surface", "The local Window representation was removed")
        }

        this.live.clear()
        const next = new Map(this.windows)

        for (const [process, { identity, client }] of current) {

            this.live.set(process, identity)
            const previous = next.get(identity)
            const signature = authoritativeSignature(client)

            if (!previous) next.set(identity, localState(client))
            else if (client.window.layer === "window" && this.authoritative.get(identity) !== signature) {

                const geometryChanged = JSON.stringify([previous.position, previous.size]) !== JSON.stringify([client.window.position, client.window.size])
                if (geometryChanged) this.cancel(identity, "geometry", "The local Window animation was replaced by authoritative state")
                next.set(identity, projectAuthoritative(previous, client, geometryChanged))
            }

            this.authoritative.set(identity, signature)
        }

        const liveIdentities = new Set(this.live.values())

        for (const [identity, relation] of this.following) {

            if (!liveIdentities.has(identity) || !liveIdentities.has(relation.target)) this.following.delete(identity)
        }

        projectFollowing(next, this.following, (identity, kind) => this.cancel(identity, kind, "The followed Window changed"))

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
        this.following.delete(identity)
        return this.changeGeometry(identity, { position, size: state.size }, transaction)
    }

    public resize(process: string, size: WindowState["size"], transaction?: RequestedTransaction) {

        const { identity, state } = this.existing(process)
        this.following.delete(identity)
        return this.changeGeometry(identity, { position: state.position, size }, transaction)
    }

    public geometry(process: string, value: WindowGeometry, transaction?: RequestedTransaction) {

        const { identity } = this.existing(process)
        this.following.delete(identity)
        return this.changeGeometry(identity, value, transaction)
    }

    public minimize(process: string, minimized: boolean, transaction?: RequestedTransaction) {

        const { identity } = this.existing(process)
        this.following.delete(identity)
        return this.changeMinimized(identity, minimized, transaction)
    }

    public follow(process: string, targetProcess: string, transaction?: RequestedTransaction) {

        const follower = this.existing(process)
        const target = this.existing(targetProcess)

        if (follower.identity === target.identity) throw new Error("A local Window cannot follow itself")

        for (let identity: string | undefined = target.identity; identity; identity = this.following.get(identity)?.target) {

            if (identity === follower.identity) throw new Error("Local Windows cannot form a following cycle")
        }

        const current = this.following.get(follower.identity)

        if (current?.target === target.identity) return Promise.resolve()

        this.following.set(follower.identity, {

            target: target.identity,

            restore: current?.restore ?? {

                position: follower.state.position,

                size: follower.state.size,

                minimized: follower.state.minimized
            }
        })

        const targetState = this.presented(target.identity, target.state)

        return Promise.all([

            this.changeGeometry(follower.identity, { position: targetState.position, size: targetState.size }, transaction),

            this.changeMinimized(follower.identity, targetState.minimized, transaction)

        ]).then(() => undefined)
    }

    public unfollow(process: string, transaction?: RequestedTransaction) {

        const { identity } = this.existing(process)
        const relation = this.following.get(identity)

        if (!relation) return Promise.resolve()

        this.following.delete(identity)

        return Promise.all([

            this.changeGeometry(identity, { position: relation.restore.position, size: relation.restore.size }, transaction),

            this.changeMinimized(identity, relation.restore.minimized, transaction)

        ]).then(() => undefined)
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
        this.authoritative.set(identity, authoritativeSignature(client))
        this.following.delete(identity)
        this.replace(identity, localState(client))
        this.projectFollowers(identity)
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

    private changeGeometry(identity: string, value: WindowGeometry, transaction?: RequestedTransaction, project = true) {

        const state = this.windows.get(identity)
        if (!state) throw new Error("This Client has no local Window representation")
        if (JSON.stringify([state.position, state.size]) === JSON.stringify([value.position, value.size])) return Promise.resolve()

        this.cancel(identity, "geometry")
        const animation = transaction ? localAnimation(++this.revision, transaction) : null
        this.replace(identity, { ...state, position: value.position, size: value.size, geometryAnimation: animation })
        if (project) this.projectFollowers(identity, transaction)
        return this.waitFor(identity, "geometry", animation, transaction)
    }

    private changeMinimized(identity: string, minimized: boolean, transaction?: RequestedTransaction, project = true) {

        const state = this.windows.get(identity)
        if (!state) throw new Error("This Client has no local Window representation")
        if (state.minimized === minimized) return Promise.resolve()

        this.cancel(identity, "minimize")
        const animation = transaction ? localAnimation(++this.revision, transaction) : null
        this.replace(identity, { ...state, minimized, minimizeAnimation: animation })
        if (project) this.projectFollowers(identity, transaction)
        return this.waitFor(identity, "minimize", animation, transaction)
    }

    private projectFollowers(target: string, transaction?: RequestedTransaction, visited = new Set<string>()) {

        if (visited.has(target)) return
        visited.add(target)

        const targetState = this.windows.get(target)
        if (!targetState) return

        const selected = transaction ? baseTransaction(transaction) : undefined

        for (const [identity, relation] of this.following) {

            if (relation.target !== target) continue

            void this.changeGeometry(identity, { position: targetState.position, size: targetState.size }, selected, false)
            void this.changeMinimized(identity, targetState.minimized, selected, false)
            this.projectFollowers(identity, selected, visited)
        }
    }

    private presented(identity: string, state: LocalWindowState) {

        const geometry = this.readers.get(identity)?.()

        return geometry ? { ...state, position: geometry.position, size: geometry.size } : state
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
    restore: Readonly<{
        position: WindowState["position"]
        size: WindowState["size"]
        minimized: boolean
    }>
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
        front: false,
        layer: window.layer,
        location: window.location,
        depth: window.depth,
        surface: null,
        geometryAnimation: null,
        minimizeAnimation: null
    }
}

function projectAuthoritative(local: LocalWindowState, client: ClientState, replaceGeometry: boolean): LocalWindowState {

    const window = client.window
    return {
        ...local,
        title: window.title,
        position: window.position,
        size: window.size,
        minimized: window.minimized,
        layer: window.layer,
        location: window.location,
        depth: window.depth,
        geometryAnimation: replaceGeometry ? null : local.geometryAnimation,
        minimizeAnimation: local.minimizeAnimation
    }
}

function windowState(local: LocalWindowState, front: boolean, geometry?: Readonly<{ position: WindowState["position"], size: WindowState["size"] }>): WindowState {

    return {
        title: local.title,
        position: geometry?.position ?? local.position,
        size: geometry?.size ?? local.size,
        minimized: local.minimized,
        front,
        layer: local.layer,
        location: local.location
    }
}

export type LocalGeometryReader = () => Readonly<{
    position: WindowState["position"]
    size: WindowState["size"]
}>

function authoritativeSignature(client: ClientState) {

    const window = client.window
    return JSON.stringify([window.title, window.position, window.size, window.minimized, window.layer, window.location, window.depth])
}

function frontmost(windows: ReadonlyMap<string, LocalWindowState>, layer: LocalWindowState["layer"]) {

    let best: [string, LocalWindowState] | null = null
    for (const candidate of windows) {

        const [, window] = candidate
        if (window.layer !== layer || window.minimized) continue
        if (!best || best[1].depth <= window.depth) best = candidate
    }
    return best?.[0] ?? null
}

function projectFollowing(
    windows: Map<string, LocalWindowState>,
    following: ReadonlyMap<string, FollowingWindow>,
    changed: (identity: string, kind: "geometry" | "minimize") => void
) {

    const projected = new Set<string>()

    function project(identity: string, stack = new Set<string>()): LocalWindowState | undefined {

        const state = windows.get(identity)
        const relation = following.get(identity)

        if (!state || !relation) return state
        if (stack.has(identity)) return state

        stack.add(identity)
        const target = project(relation.target, stack)
        stack.delete(identity)

        if (!target) return state

        const geometryChanged = JSON.stringify([state.position, state.size]) !== JSON.stringify([target.position, target.size])
        const minimizedChanged = state.minimized !== target.minimized

        if (geometryChanged) changed(identity, "geometry")
        if (minimizedChanged) changed(identity, "minimize")

        const next = {
            ...state,
            position: target.position,
            size: target.size,
            minimized: target.minimized,
            geometryAnimation: geometryChanged ? target.geometryAnimation : state.geometryAnimation,
            minimizeAnimation: minimizedChanged ? target.minimizeAnimation : state.minimizeAnimation
        }

        windows.set(identity, next)
        projected.add(identity)
        return next
    }

    for (const identity of following.keys()) if (!projected.has(identity)) project(identity)
}
