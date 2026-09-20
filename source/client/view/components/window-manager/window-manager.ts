import ClientState from "@client/core/link-manager/auth-manager/process-manager/client-state"
import Process from "@client/core/link-manager/auth-manager/process-manager/process"
import { ReactTunnel } from "@the-link/react"
import { type Layer, type Position, type Size, type Value } from "@phreshos/core"
import { useCallback, useRef, useState } from "react"
import { type default as AuthManager } from "@client/core/link-manager/auth-manager/auth-manager"
import WindowPresentations from "./window-presentations"
import { isDesktopReplacementLayer } from "@shared/window-layers"
import { type SharedResizeWindow } from "./shared-resize"
import { type WindowRegion } from "./window-geometry"

/**
 * The authorized view's windows: processes that have one. A window is a
 * process whose program has a client half, so the process itself says
 * whether it is shown — nothing else is consulted.
 *
 * The Desktop presentation and authoritative counterpart are distinct.
 * Following starts enabled for ordinary windows and disabled for the other layers.
 * Each Client can subsequently follow an authoritative Window or detach.
 *
 * Departure is representation. Stopping a Client removes only its execution
 * context; its Client Endpoint-owned authoritative Window remains. The last
 * desktop-owned representation is kept until its exit animation reports
 * done, while the iframe leaves as soon as the stop is confirmed.
 */
export default function useWindows(authManager: AuthManager) {

    const peer = authManager.processManager

    const inbound = ReactTunnel.useFactory(peer.$inbound)

    const [processes, setProcesses] = useState(() => [...peer.processes.values()])

    const incarnationIds = useRef(new WeakMap<ClientState, string>())

    const nextIncarnation = useRef(0)

    const incarnation = useCallback(function (record: Process, client: ClientState): WindowIncarnation {

        let identity = incarnationIds.current.get(client)

        if (!identity) {

            identity = `${record.identity}:${nextIncarnation.current++}`

            incarnationIds.current.set(client, identity)
        }

        return { identity, record, client }

    }, [])

    const initialIncarnations = useRef<Map<string, WindowIncarnation> | null>(null)

    if (!initialIncarnations.current) initialIncarnations.current = new Map(processes.flatMap(record => record.client ? [[record.identity, incarnation(record, record.client)] as const] : []))

    const initialClients = initialIncarnations.current

    const presentationController = useRef<WindowPresentations | null>(null)

    if (!presentationController.current) presentationController.current = new WindowPresentations(initialClients, process => peer.processes.get(process)?.client ?? null)

    const presentation = presentationController.current

    const [presentations, setPresentations] = useState(presentation.windows)

    presentation.listen(setPresentations)

    const previousClients = useRef(initialClients)

    // Client states already present when this desktop mounts are restored,
    // not launched, so their representations must not replay an entrance.
    const inheritedClients = useRef(new WeakSet([...initialClients.values()].map(({ client }) => client)))

    const [leaving, setLeaving] = useState<WindowIncarnation[]>([])

    // A close press asks the core to terminate the Process. Keep that request
    // visible until the Process actually leaves the authoritative collection.
    const stopping = useRef(new Set<string>())

    const [, redrawStopping] = useState(0)

    // The order the desktop draws in: a window is added when it first
    // appears and taken out when its departure has played, and nothing
    // else moves it. Held rather than derived, because the two lists it
    // orders are not one list, and their concatenation is not this.
    const [order, setOrder] = useState<string[]>(() => [...initialClients.values()].map(({ identity }) => identity))

    // Departures are derived at the moment the truth arrives — the same
    // event updates both lists in one batch, so no render ever shows a
    // window in neither.
    const subscriber = useCallback((...results: unknown[]) => {

        const [list] = results as [Process[]]

        const present = new Set(list.map(process => process.identity))

        const currentClients = new Map(list.flatMap(record => record.client ? [[record.identity, incarnation(record, record.client)] as const] : []))

        presentation.reconcile(currentClients)

        let settled = false

        for (const identity of stopping.current) {

            if (present.has(identity)) continue

            stopping.current.delete(identity)

            settled = true
        }

        if (settled) redrawStopping(revision => revision + 1)

        const gone = [...previousClients.current.values()].filter(previous => currentClients.get(previous.record.identity)?.client !== previous.client)

        const departed = new Set(gone.filter(({ client }) => isDesktopReplacementLayer(client.window.layer)).map(({ identity }) => identity))

        for (const identity of departed) presentation.remove(identity)

        const animated = gone.filter(({ identity }) => !departed.has(identity))

        if (animated.length) setLeaving(function (current) {

            const retained = new Set(current.map(({ identity }) => identity))

            return [...current, ...animated.filter(({ identity }) => !retained.has(identity))]
        })

        setOrder(function (current) {

            const retained = new Set(current)

            const added = [...currentClients.values()].filter(({ identity }) => !retained.has(identity)).map(({ identity }) => identity)

            return added.length || departed.size ? [...current.filter(identity => !departed.has(identity)), ...added] : current
        })

        previousClients.current = currentClients

        setProcesses(list)

    }, [incarnation])

    inbound.useSubscribe("/processes", subscriber)

    const records = processes.filter(process => process.client)

    // Everything that is shown, in the layer it is shown in — and the
    // taskbar's list, which is the `window` layer and nothing else. The
    // taskbar shows windows, not processes: every entry in it is a thing
    // you can focus, minimise and restore, and a row whose entries do
    // not all answer the same press is one row teaching two rules.
    const listed = records.filter(process => process.client!.window.layer === "window")

    // The greatest depth *in one layer*. Bringing a window forward
    // brings it forward among its own kind; a program in `over` opening
    // does not push a window's number up.
    const summit = useCallback((layer: Layer) => [...peer.processes.values()].reduce((highest, process) => process.client?.window.layer === layer ? Math.max(highest, process.client.window.depth) : highest, 0), [peer])

    // Resolve the front window of every layer in one pass.
    const fronts: Record<Layer, Process | null> = { wallpaper: null, under: null, window: null, over: null, "start-menu": null }

    for (const process of records) {

        const live = incarnation(process, process.client!)

        const window = presentations.get(live.identity)

        if (!window || window.minimized) continue

        const best = fronts[window.layer]

        const bestWindow = best && presentations.get(incarnation(best, best.client!).identity)

        if (!bestWindow || bestWindow.depth <= window.depth) fronts[window.layer] = process
    }

    // Presentation and authoritative mutation are two explicit acts.
    // The presentation act already rendered the result; only the server echo may
    // project the authoritative act back onto an ordinary Window.
    const commit = useCallback(function (request: Promise<void>) {

        request.catch(() => undefined)
    }, [])

    const close = useCallback(function (process: Process) {

        if (stopping.current.has(process.identity)) return

        stopping.current.add(process.identity)

        redrawStopping(revision => revision + 1)

        process.exit().catch(() => {

            stopping.current.delete(process.identity)

            redrawStopping(revision => revision + 1)
        })

    }, [])

    const closed = useCallback(function (identity: string) {

        setLeaving(current => current.filter(entry => entry.identity !== identity))

        setOrder(current => current.filter(entry => entry !== identity))

        presentation.remove(identity)

    }, [])

    const raise = useCallback(function (process: Process) {

        const window = process.client?.window

        if (!window || window.layer !== "window") return

        const highest = summit(window.layer)

        presentation.raise(process.identity)

        if (window.depth === highest) return

        commit(window.raise())

    }, [commit, summit])

    const minimize = useCallback(function (process: Process, minimized: boolean) {

        const window = process.client?.window

        if (!window || window.layer !== "window") return

        void presentation.minimize(process.identity, minimized)

        commit(window.minimize(minimized))

    }, [commit])

    const show = useCallback(function (process: Process) {

        const window = process.client?.window

        if (!window || window.layer !== "window") return

        if (presentation.state(process.identity).minimized) minimize(process, false)

        raise(process)

    }, [minimize, raise])

    const move = useCallback(function (process: Process, x: Value, y: Value) {

        const window = process.client?.window

        if (!window || window.layer !== "window") return

        void presentation.move(process.identity, { x, y })

        commit(window.move({ x, y }))

    }, [commit])

    const resize = useCallback(function (process: Process, width: Value, height: Value, position: Position | null) {

        const window = process.client?.window

        if (!window || window.layer !== "window") return

        if (!position) {

            void presentation.resize(process.identity, { width, height })

            commit(window.resize({ width, height }))

            return
        }

        const geometry = { ...position, width, height }

        void presentation.setGeometry(process.identity, geometry)

        commit(window.setGeometry(geometry))

    }, [commit])

    const snap = useCallback(function (process: Process, position: Position, size: Size) {

        const window = process.client?.window

        if (!window || window.layer !== "window") return

        const geometry = { ...position, ...size }

        void presentation.setGeometry(process.identity, geometry)

        commit(window.setGeometry(geometry))

    }, [commit])

    const fill = useCallback(function (process: Process) {
        const window = process.client?.window
        if (!window || window.layer !== "window") return
        const maximized = !presentation.projection(process.identity).maximized
        void presentation.maximize(process.identity, maximized)
        commit(window.maximize(maximized))
    }, [commit])

    // Every window on the desktop, in one list and one order.
    //
    // A closing client incarnation keeps the place it had. A restarted
    // Client receives a new Desktop presentation identity even when
    // the surrounding Process and its Client Endpoint-owned Window
    // remain the same.
    const rank = new Map(order.map((identity, index) => [identity, index]))

    const panes = [

        ...records.map(record => {

            const live = incarnation(record, record.client!)

            return { ...live, presentation: presentations.get(live.identity)!, closing: false, stopping: stopping.current.has(record.identity), entering: !inheritedClients.current.has(live.client) }
        }),

        ...leaving.map(window => ({ ...window, presentation: presentations.get(window.identity)!, closing: true, stopping: false, entering: !inheritedClients.current.has(window.client) }))
    ]

        .sort((one, other) => (rank.get(one.identity) ?? Number.MAX_SAFE_INTEGER) - (rank.get(other.identity) ?? Number.MAX_SAFE_INTEGER))

    const panesByLayer: Record<Layer, typeof panes> = { wallpaper: [], under: [], window: [], over: [], "start-menu": [] }

    for (const pane of panes) {

        panesByLayer[pane.presentation.layer].push(pane)
    }

    const sharedResizeWindows: SharedResizeWindow[] = panesByLayer.window.flatMap(function (pane) {

        if (pane.closing || pane.stopping || pane.presentation.minimized || pane.presentation.maximized) return []

        const geometry = presentation.representedGeometry(pane.record.identity)

        if (!geometry) return []

        return [{ identity: pane.record.identity, geometry, depth: pane.presentation.depth }]
    })

    const presentSharedResize = useCallback(function (geometries: ReadonlyMap<string, WindowRegion>) {

        for (const [identity, geometry] of geometries) presentation.presentGeometry(identity, geometry)

    }, [presentation])

    const beginSharedResize = useCallback(function (identities: readonly string[]) {

        const geometries = new Map<string, WindowRegion>()

        for (const identity of identities) {

            const geometry = presentation.beginGeometry(identity)

            if (geometry) {

                geometries.set(identity, geometry)

                continue
            }

            for (const started of geometries.keys()) presentation.cancelGeometry(started)

            return null
        }

        return geometries

    }, [presentation])

    const finishSharedResize = useCallback(function (identities: readonly string[]) {

        for (const identity of identities) presentation.finishGeometry(identity)

    }, [presentation])

    const cancelSharedResize = useCallback(function (identities: readonly string[]) {

        for (const identity of identities) presentation.cancelGeometry(identity)

    }, [presentation])

    const commitSharedResize = useCallback(function (geometries: ReadonlyMap<string, WindowRegion>) {

        for (const [identity, region] of geometries) {

            const process = peer.processes.get(identity)

            const window = process?.client?.window

            if (!window || window.layer !== "window") continue

            const geometry = { ...region }

            void presentation.setGeometry(identity, geometry)

            commit(window.setGeometry(geometry))
        }

    }, [commit, presentation, peer])

    return {

        records,

        listed,

        panesByLayer,

        fronts,

        presentation,

        sharedResize: {
            windows: sharedResizeWindows,
            begin: beginSharedResize,
            present: presentSharedResize,
            commit: commitSharedResize,
            finish: finishSharedResize,
            cancel: cancelSharedResize
        },

        close,

        closed,

        // ── The primitives, one act each ─────────────────────────────
        //
        // The window manager composes them below; nothing here does two
        // things at once, because the system beneath does not either.
        raise,

        minimize,

        // ── And the policy, which is the window manager's ────────────
        //
        // A person pressing a taskbar item means *show me this one*, so
        // it is shown and brought to the front — two primitives, said
        // here, where a person's expectation belongs. The system knows
        // nothing about the pairing.
        show,

        // Toggle authoritative maximization and its local presentation.
        fill,

        move,

        // A resize that moved no origin is only a resize: writing the
        // pixels a share resolved to would silence the share, and the
        // window would stop following the surface it was sized against.
        resize,

        // A snap names a share of the surface rather than pixels, so
        // every client resolves it in its own space.
        snap
    }
}

export type DesktopWindows = ReturnType<typeof useWindows>

interface WindowIncarnation {

    identity: string

    record: Process

    client: ClientState
}
