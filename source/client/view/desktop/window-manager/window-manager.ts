import ClientState from "@client/core/link-manager/auth-manager/process-manager/client-state"
import Process from "@client/core/link-manager/auth-manager/process-manager/process"
import ReactTunnel from "@libs/the-link/plugins/react-helper/react-tunnel"
import { Layer } from "@server/core/link-manager/auth-manager/program-manager/config"
import { type Position, type Size, type Value } from "@phreshos/core"
import { useCallback, useRef, useState } from "react"
import { AuthManagerContext } from "../../contexts"
import { wholeWindowGeometry } from "./window-geometry"
import LocalWindows from "./local-windows"

/**
 * The authorized view's windows: processes that have one. A window is a
 * process whose program has a client half, so the process itself says
 * whether it is shown — nothing else is consulted.
 *
 * The local representation and authoritative counterpart are distinct.
 * Ordinary windows project authoritative changes automatically; under and
 * over windows retain their local projection after its initial seed.
 *
 * Departure is representation. The truth drops a stopped client and its
 * Window at once; the exit still has to play, so the last desktop-owned
 * representation is kept until its animation reports done. Its iframe is
 * not part of that snapshot and leaves as soon as the stop is confirmed.
 */
export default function useWindows() {

    const authManager = AuthManagerContext.useValue()

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

    if (!initialIncarnations.current) initialIncarnations.current = new Map(processes.flatMap(record => record.client && record.client.window.layer !== "wallpaper" ? [[record.identity, incarnation(record, record.client)] as const] : []))

    const initialClients = initialIncarnations.current

    const localController = useRef<LocalWindows | null>(null)

    if (!localController.current) localController.current = new LocalWindows(initialClients, process => peer.processes.get(process)?.client ?? null)

    const localWindow = localController.current

    const [localWindows, setLocalWindows] = useState(localWindow.windows)

    localWindow.listen(setLocalWindows)

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

    // Where a window was before it was made to fill the surface.
    //
    // The system stopped remembering this when `maximize` stopped being
    // a state: filling the surface is a size like any other now, so
    // nothing there can undo it. The button that offers the undo keeps
    // what it needs to honour it — a ref rather than state, because
    // nothing is drawn from it.
    const filled = useRef(new Map<string, { position: Position, size: Size }>())

    // Departures are derived at the moment the truth arrives — the same
    // event updates both lists in one batch, so no render ever shows a
    // window in neither.
    const subscriber = useCallback((...results: unknown[]) => {

        const [list] = results as [Process[]]

        const present = new Set(list.map(process => process.identity))

        const currentClients = new Map(list.flatMap(record => record.client && record.client.window.layer !== "wallpaper" ? [[record.identity, incarnation(record, record.client)] as const] : []))

        localWindow.reconcile(currentClients)

        let settled = false

        for (const identity of stopping.current) {

            if (present.has(identity)) continue

            stopping.current.delete(identity)

            settled = true
        }

        if (settled) redrawStopping(revision => revision + 1)

        const gone = [...previousClients.current.values()].filter(previous => currentClients.get(previous.record.identity)?.client !== previous.client)

        if (gone.length) setLeaving(function (current) {

            const retained = new Set(current.map(({ identity }) => identity))

            return [...current, ...gone.filter(({ identity }) => !retained.has(identity))]
        })

        setOrder(function (current) {

            const retained = new Set(current)

            const added = [...currentClients.values()].filter(({ identity }) => !retained.has(identity)).map(({ identity }) => identity)

            return added.length ? [...current, ...added] : current
        })

        previousClients.current = currentClients

        setProcesses(list)

    }, [incarnation])

    inbound.useSubscribe("/processes", subscriber)

    const records = processes.filter(process => process.client && process.client.window.layer !== "wallpaper")

    const wallpaper = processes.find(process => process.client?.window.layer === "wallpaper") ?? null

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

    // The front window of each layer, resolved together. Three separate
    // reductions walked every process three times on every window event.
    const fronts: Record<Layer, Process | null> = { under: null, window: null, over: null }

    for (const process of records) {

        const live = incarnation(process, process.client!)

        const window = localWindows.get(live.identity)

        if (!window || window.layer === "wallpaper" || window.minimized) continue

        const best = fronts[window.layer]

        const bestWindow = best && localWindows.get(incarnation(best, best.client!).identity)

        if (!bestWindow || bestWindow.depth <= window.depth) fronts[window.layer] = process
    }

    // Local representation and authoritative mutation are two explicit acts.
    // The local act already rendered the result; only the server echo may
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

        localWindow.remove(identity)

    }, [])

    const raise = useCallback(function (process: Process) {

        const window = process.client?.window

        if (!window || window.layer !== "window") return

        const highest = summit(window.layer)

        localWindow.raise(process.identity)

        if (window.depth === highest) return

        commit(window.raise())

    }, [commit, summit])

    const minimize = useCallback(function (process: Process, minimized: boolean) {

        const window = process.client?.window

        if (!window || window.layer !== "window") return

        localWindow.minimize(process.identity, minimized)

        commit(window.minimize(minimized))

    }, [commit])

    const show = useCallback(function (process: Process) {

        const window = process.client?.window

        if (!window || window.layer !== "window") return

        if (localWindow.state(process.identity).minimized) minimize(process, false)

        raise(process)

    }, [minimize, raise])

    const move = useCallback(function (process: Process, x: Value, y: Value) {

        const window = process.client?.window

        if (!window || window.layer !== "window") return

        void localWindow.move(process.identity, { x, y })

        commit(window.move({ x, y }))

    }, [commit])

    const resize = useCallback(function (process: Process, width: Value, height: Value, position: Position | null) {

        const window = process.client?.window

        if (!window || window.layer !== "window") return

        if (!position) {

            void localWindow.resize(process.identity, { width, height })

            commit(window.resize({ width, height }))

            return
        }

        const geometry = { position, size: { width, height } }

        void localWindow.geometry(process.identity, geometry)

        commit(window.setGeometry(geometry))

    }, [commit])

    const snap = useCallback(function (process: Process, position: Position, size: Size) {

        const window = process.client?.window

        if (!window || window.layer !== "window") return

        const geometry = { position, size }

        void localWindow.geometry(process.identity, geometry)

        commit(window.setGeometry(geometry))

    }, [commit])

    const fill = useCallback(function (process: Process) {

        const window = process.client?.window

        if (!window || window.layer !== "window") return

        const shown = localWindow.state(process.identity)

        const projection = localWindow.projection(process.identity)

        const was = filled.current.get(process.identity)

        const whole = wholeWindowGeometry(projection.position, projection.size)

        if (whole && was) {

            filled.current.delete(process.identity)

            snap(process, was.position, was.size)

            return
        }

        filled.current.set(process.identity, { position: shown.position, size: shown.size })

        snap(process, { x: "0/1", y: "0/1" }, { width: "1/1", height: "1/1" })

    }, [snap])

    // Every window on the desktop, in one list and one order.
    //
    // A closing client incarnation keeps the place it had. A restarted
    // Client receives a new desktop-local representation identity even when
    // the surrounding Process and its public Client-owned Window capability
    // remain the same.
    const rank = new Map(order.map((identity, index) => [identity, index]))

    const panes = [

        ...records.map(record => {

            const live = incarnation(record, record.client!)

            return { ...live, local: localWindows.get(live.identity)!, closing: false, stopping: stopping.current.has(record.identity), entering: !inheritedClients.current.has(live.client) }
        }),

        ...leaving.map(window => ({ ...window, local: localWindows.get(window.identity)!, closing: true, stopping: false, entering: !inheritedClients.current.has(window.client) }))
    ]

        .sort((one, other) => (rank.get(one.identity) ?? Number.MAX_SAFE_INTEGER) - (rank.get(other.identity) ?? Number.MAX_SAFE_INTEGER))

    const panesByLayer: Record<Layer, typeof panes> = { under: [], window: [], over: [] }

    for (const pane of panes) {

        const layer = pane.local.layer

        if (layer !== "wallpaper") panesByLayer[layer].push(pane)
    }

    return {

        records,

        wallpaper,

        listed,

        panesByLayer,

        fronts,

        localWindow,

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

        // Filling the surface, and coming back from it. Not a state the
        // system holds: there is no `maximized` any more, only a size —
        // so the memory of where a window was before it filled the
        // surface is kept here, in the interface that offers the button.
        // Whoever offers an undo owns what it undoes.
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

interface WindowIncarnation {

    identity: string

    record: Process

    client: ClientState
}
