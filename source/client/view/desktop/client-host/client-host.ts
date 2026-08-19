import ReactTunnel from "@libs/the-link/plugins/react-helper/react-tunnel"
import { type WindowLayer } from "@phreshos/core"
import useAnnouncements from "./announcements"
import { type Space } from "./host"
import DesktopPointer from "./pointer"
import ClientProcessBoundary from "./client-process-boundary"
import ClientTraffic from "./client-traffic"
import { type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { AuthManagerContext } from "../../contexts"
import { isPermissionName } from "@phreshos/core"
import { removeClientSurface, setClientSurface, type ClientSurfaceHost, type ClientSurfaceState } from "./client-surface"

/**
 * The browser boundary between a program pane and the desktop that hosts it.
 * It owns frame messages and the measured surfaces those frames inhabit;
 * neither fact participates in rendering.
 */
export default function useClientHost(desktop: RefObject<HTMLDivElement | null>, sources: Map<string, HTMLIFrameElement | null>) {

    const authManager = AuthManagerContext.useValue()

    const windowSurfaceRef = useRef<HTMLElement>(null)

    const frameOwners = useRef(new Map<string, string>())

    const frameTasks = useRef(new Map<string, Promise<void>>())

    const boundaries = useRef(new Map<string, ClientProcessBoundary>())

    const [pointer] = useState(() => new DesktopPointer(desktop))

    const [traffic] = useState(() => new ClientTraffic())

    const [windowSurfaceSize, setWindowSurfaceSize] = useState<SurfaceSize>({ width: 0, height: 0 })

    const [clientSurfaces, setClientSurfaces] = useState<ReadonlyMap<string, ClientSurfaceState>>(() => new Map())

    const clientSurface = useMemo<ClientSurfaceHost>(() => ({

        set(identity, settings) {

            setClientSurfaces(current => setClientSurface(current, identity, settings))
        },

        remove(identity) {

            setClientSurfaces(current => removeClientSurface(current, identity))
        }

    }), [])

    // Read by the gate at the moment a pane asks, so the answer is
    // never a render behind.
    const latest = useRef<Record<WindowLayer, Space>>({

        under: { width: 0, height: 0 },

        window: { width: 0, height: 0 },

        over: { width: 0, height: 0 },

        wallpaper: { width: 0, height: 0 }
    })

    useLayoutEffect(function () {

        if (!desktop.current || !windowSurfaceRef.current) return

        function measure(entry: ResizeObserverEntry): Space {

            return { width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) }
        }

        function announce(layer: WindowLayer, now: Space) {

            latest.current[layer] = now

            // Announcements leave directly from the measurement. The
            // ordinary surface also participates in rendering because its
            // windows resolve which painted edges touch its boundaries.
            if (!now.width) return

            for (const identity of sources.keys()) {

                if (authManager.processManager.processes.get(identity)?.client?.window.layer !== layer) continue

                traffic.emit(identity, "host-surface", "resize", now).catch(() => undefined)
            }
        }

        function rememberWindowSurfaceSize({ width, height }: SurfaceSize) {

            setWindowSurfaceSize(current => current.width === width && current.height === height ? current : { width, height })
        }

        const initial = windowSurfaceRef.current.getBoundingClientRect()

        rememberWindowSurfaceSize(initial)

        const viewportObserver = new ResizeObserver(function ([entry]) {

            const now = measure(entry)

            announce("under", now)

            announce("over", now)

            announce("wallpaper", now)
        })

        const windowObserver = new ResizeObserver(function ([entry]) {

            rememberWindowSurfaceSize(entry.contentRect)

            announce("window", measure(entry))
        })

        viewportObserver.observe(desktop.current)

        windowObserver.observe(windowSurfaceRef.current)

        return function () {

            viewportObserver.disconnect()

            windowObserver.disconnect()
        }

    }, [authManager, desktop, sources, traffic])

    useAnnouncements(boundaries.current, traffic)

    useEffect(() => pointer.listen(), [pointer])

    // The process-to-interface leg rides the same tunnel the echoes
    // land on: an end-end arrives as (identity, json) and is posted into
    // its pane in its envelope. The op's own echo shares the event name
    // with a null payload — the type guard tells them apart.
    const inbound = ReactTunnel.useFactory(authManager.processManager.$inbound)

    inbound.useSubscribe("/end-end", useCallback((...results: unknown[]) => {

        const [identity, json] = results

        if (typeof identity !== "string" || typeof json !== "string") return

        const values = JSON.parse(json) as unknown[]

        if ((values[0] === "answer" || values[0] === "wait") && typeof values[1] === "string") boundaries.current.get(identity)?.deliver("end-end", ...values).catch(() => undefined)

        else traffic.emit(identity, "end-end", ...values).catch(() => undefined)

    }, [sources, traffic]))

    // A held Process observes through a separate envelope. The core has
    // already targeted the subscribing process; this desktop offers the
    // copy only to that process's frame, and never puts it on end-end.
    // Observed publications and request answering remain separate routes.
    inbound.useSubscribe("/observed", useCallback((...results: unknown[]) => {

        const [observer, owner, subscription, json] = results

        if (typeof observer !== "string" || typeof owner !== "string" || typeof subscription !== "string" || typeof json !== "string") return

        if (frameOwners.current.get(observer) !== owner) return

        traffic.emit(observer, "observed", subscription, ...JSON.parse(json) as unknown[]).catch(() => undefined)

    }, [sources, traffic]))

    // Destinationless Endpoint events use their own route and therefore never
    // appear in directed traffic observations.
    inbound.useSubscribe("/emitted", useCallback((...results: unknown[]) => {

        const [observer, owner, subscription, json] = results

        if (typeof observer !== "string" || typeof owner !== "string" || typeof subscription !== "string" || typeof json !== "string") return

        if (frameOwners.current.get(observer) !== owner) return

        traffic.emit(observer, "emitted", subscription, ...JSON.parse(json) as unknown[]).catch(() => undefined)

    }, [sources, traffic]))

    // Exact service lifecycle and channel events use their own route. They
    // reach only the frame lease that registered the opaque subscription.
    inbound.useSubscribe("/service-event", useCallback((...results: unknown[]) => {

        const [observer, owner, subscription, json] = results

        if (typeof observer !== "string" || typeof owner !== "string" || typeof subscription !== "string" || typeof json !== "string") return

        if (frameOwners.current.get(observer) !== owner) return

        traffic.emit(observer, "service-event", subscription, ...JSON.parse(json) as unknown[]).catch(() => undefined)

    }, [sources, traffic]))

    inbound.useSubscribe("/impossible", useCallback((...results: unknown[]) => {

        const [observer, owner, subscription, reason] = results

        if (typeof observer !== "string" || typeof owner !== "string" || typeof subscription !== "string" || typeof reason !== "string") return

        if (frameOwners.current.get(observer) !== owner) return

        boundaries.current.get(observer)?.impossible(subscription, reason)

    }, [sources]))

    inbound.useSubscribe("/client-stop", useCallback((...results: unknown[]) => {

        const [identity] = results

        if (typeof identity !== "string") return

        boundaries.current.get(identity)?.release().catch(() => undefined)

        boundaries.current.delete(identity)

        sources.delete(identity)

    }, [sources]))

    inbound.useSubscribe("/permission-changed", useCallback((...results: unknown[]) => {

        const [identity, permission, decision] = results

        if (typeof identity !== "string" || !isPermissionName(permission) || (decision !== true && decision !== false && decision !== null)) return

        boundaries.current.get(identity)?.permissionChanged(permission, decision)

    }, []))

    const frame = useCallback(function (identity: string, element: HTMLIFrameElement | null) {

        if (element) {

            sources.set(identity, element)

            boundaries.current.get(identity)?.release().catch(() => undefined)

            boundaries.current.set(identity, new ClientProcessBoundary(identity, element, authManager, layer => latest.current[layer], pointer, traffic, clientSurface))

            return
        }

        sources.delete(identity)

        const boundary = boundaries.current.get(identity)

        boundaries.current.delete(identity)

        frameOwners.current.delete(identity)

        boundary?.release().catch(() => undefined)

    }, [authManager, clientSurface, pointer, sources, traffic])

    const frameLoaded = useCallback(function (identity: string, element: HTMLIFrameElement) {

        const previous = frameTasks.current.get(identity) ?? Promise.resolve()

        const task = previous.catch(() => undefined).then(async function () {

            if (sources.get(identity) !== element) return

            const owner = crypto.randomUUID()

            frameOwners.current.set(identity, owner)

            try {

                const boundary = boundaries.current.get(identity)

                if (!boundary || boundary.element !== element) return

                await boundary.own(owner)

                if (sources.get(identity) !== element || frameOwners.current.get(identity) !== owner) {

                    await boundary.release()

                    return
                }

            }

            catch (error) { console.error(error) }
        })

        frameTasks.current.set(identity, task)

        task.finally(() => { if (frameTasks.current.get(identity) === task) frameTasks.current.delete(identity) }).catch(() => undefined)

    }, [authManager, pointer, sources])

    // The interface wall: an iframe's end-end relays to its process's
    // other end; its end-host terminates here, handled by the desktop —
    // the interface's host. Args cross The Link as standard JSON in a
    // plain string — The Link's serialization never shapes a payload.
    // A cached iframe may begin executing before passive effects run. Install
    // its boundary listener during the commit, before the browser can run it,
    // so the document's first explicit request cannot disappear.
    useLayoutEffect(function () {

        function onMessage(event: MessageEvent) {

            if (!Array.isArray(event.data)) return

            for (const boundary of boundaries.current.values()) {

                const source = boundary.element

                if (source?.contentWindow !== event.source) continue

                boundary.receive(event.data)

                return
            }
        }

        window.addEventListener("message", onMessage)

        return () => window.removeEventListener("message", onMessage)

    }, [authManager, pointer, sources])

    return { windowSurfaceRef, windowSurfaceSize, clientSurfaces, frame, frameLoaded }
}

export interface SurfaceSize {

    width: number

    height: number
}
