import ClientState from "@client/core/link-manager/auth-manager/process-manager/client-state"
import { type Transaction, type WindowGeometry, type WindowState } from "@phreshos/core"
import { layerAllowsSurface, type LocalWindowHost, type LocalWindowState } from "../desktop-host/local-window"

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

        this.publish(next)
    }

    public remove(identity: string) {

        if (!this.windows.has(identity)) return
        const next = new Map(this.windows)
        next.delete(identity)
        this.readers.delete(identity)
        this.authoritative.delete(identity)
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

    public move(process: string, position: WindowState["position"], transaction?: Transaction) {

        const state = this.existing(process).state
        return this.geometry(process, { position, size: state.size }, transaction)
    }

    public resize(process: string, size: WindowState["size"], transaction?: Transaction) {

        const state = this.existing(process).state
        return this.geometry(process, { position: state.position, size }, transaction)
    }

    public geometry(process: string, value: WindowGeometry, transaction?: Transaction) {

        const { identity, state } = this.existing(process)
        if (JSON.stringify([state.position, state.size]) === JSON.stringify([value.position, value.size])) return Promise.resolve()

        this.cancel(identity, "geometry")
        const animation = transaction ? { revision: ++this.revision, transaction } : null
        this.replace(identity, { ...state, position: value.position, size: value.size, geometryAnimation: animation })
        return this.waitFor(identity, "geometry", animation)
    }

    public minimize(process: string, minimized: boolean) {

        const { identity, state } = this.existing(process)
        this.replace(identity, { ...state, minimized })
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

    public setSurface(process: string, transaction: Transaction) {

        const { identity, state } = this.existing(process)
        layerAllowsSurface(state.layer)
        if (state.surface?.visible) return Promise.resolve()

        this.cancel(identity, "surface")
        const transition = { revision: ++this.revision, transaction }
        this.replace(identity, { ...state, surface: { visible: true, transition } })
        return this.waitFor(identity, "surface", transition)
    }

    public removeSurface(process: string, transaction: Transaction) {

        const { identity, state } = this.existing(process)
        layerAllowsSurface(state.layer)
        if (!state.surface || !state.surface.visible) return Promise.resolve()

        this.cancel(identity, "surface")
        const transition = { revision: ++this.revision, transaction }
        this.replace(identity, { ...state, surface: { visible: false, transition } })
        return this.waitFor(identity, "surface", transition)
    }

    public complete(process: string, kind: AnimationKind, revision: number) {

        const identity = this.live.get(process)
        if (!identity) return
        const state = this.windows.get(identity)
        const animation = kind === "geometry" ? state?.geometryAnimation : state?.surface?.transition
        if (!state || animation?.revision !== revision) return

        this.replace(identity, kind === "geometry"
            ? { ...state, geometryAnimation: null }
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
        this.cancel(identity, "surface", "The local Window representation was removed")

        const client = this.client(process)
        if (!client) return
        this.authoritative.set(identity, authoritativeSignature(client))
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

    private waitFor(identity: string, kind: AnimationKind, animation: LocalWindowState["geometryAnimation"]) {

        if (!animation?.transaction.wait) return Promise.resolve()
        return new Promise<void>((resolve, reject) => {

            this.waiting.set(animationKey(identity, kind), { revision: animation.revision, resolve, reject })
        })
    }
}

type AnimationKind = "geometry" | "surface"

interface WaitingAnimation {
    revision: number
    resolve: () => void
    reject: (error: Error) => void
}

function animationKey(identity: string, kind: AnimationKind) {

    return `${identity}:${kind}`
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
        geometryAnimation: null
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
        geometryAnimation: replaceGeometry ? null : local.geometryAnimation
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
