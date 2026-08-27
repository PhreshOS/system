import ReactTunnel from "@libs/the-link/plugins/react-helper/react-tunnel"
import { isPermissionName } from "@phreshos/core"
import useAnnouncements from "./announcements"
import { type DesktopSize } from "./host"
import DesktopPointer from "./pointer"
import ClientProcessBoundary from "./client-process-boundary"
import ClientTraffic from "./client-traffic"
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { type default as AuthManager } from "@client/core/link-manager/auth-manager/auth-manager"
import { type LocalWindowHost } from "./local-window"
import messagepack from "@libs/messagepack"

/**
 * The browser boundary between a program pane and the desktop that hosts it.
 * It owns frame messages and the measured desktop containing those frames;
 * neither fact participates in rendering.
 */
export default function useClientHost(authManager: AuthManager, desktop: RefObject<HTMLDivElement | null>, sources: Map<string, HTMLIFrameElement | null>, localWindow: LocalWindowHost) {

    const windowSurfaceRef = useRef<HTMLElement>(null)

    const frameOwners = useRef(new Map<string, string>())

    const frameTasks = useRef(new Map<string, Promise<void>>())

    const boundaries = useRef(new Map<string, ClientProcessBoundary>())

    const [pointer] = useState(() => new DesktopPointer(desktop))

    const [traffic] = useState(() => new ClientTraffic())

    const [windowSurfaceSize, setWindowSurfaceSize] = useState<SurfaceSize>({ width: 0, height: 0 })

    const latestDesktopSize = useRef<DesktopSize>({ width: 0, height: 0 })

    const desktopSize = useCallback(function (): DesktopSize {

        const bounds = desktop.current?.getBoundingClientRect()

        return bounds
            ? { width: Math.round(bounds.width), height: Math.round(bounds.height) }
            : latestDesktopSize.current

    }, [desktop])

    useLayoutEffect(function () {

        if (!desktop.current || !windowSurfaceRef.current) return

        function measure(bounds: { width: number, height: number }): DesktopSize {

            return { width: Math.round(bounds.width), height: Math.round(bounds.height) }
        }

        function announceDesktop(now: DesktopSize) {

            if (latestDesktopSize.current.width === now.width && latestDesktopSize.current.height === now.height) return

            latestDesktopSize.current = now

            // Announcements leave directly from the full desktop measurement.
            // Traffic carries them only to boundaries with a live interest.
            if (!now.width) return

            for (const identity of sources.keys()) {

                traffic.emit(identity, "host-desktop", "resize", now).catch(() => undefined)
            }
        }

        function rememberWindowSurfaceSize({ width, height }: SurfaceSize) {

            setWindowSurfaceSize(current => current.width === width && current.height === height ? current : { width, height })
        }

        const initialDesktop = measure(desktop.current.getBoundingClientRect())

        latestDesktopSize.current = initialDesktop

        const initialWindowSurface = windowSurfaceRef.current.getBoundingClientRect()

        rememberWindowSurfaceSize(initialWindowSurface)

        const desktopObserver = new ResizeObserver(function ([entry]) {

            announceDesktop(measure(entry.contentRect))
        })

        const windowObserver = new ResizeObserver(function ([entry]) {

            rememberWindowSurfaceSize(entry.contentRect)

        })

        desktopObserver.observe(desktop.current)

        windowObserver.observe(windowSurfaceRef.current)

        return function () {

            desktopObserver.disconnect()

            windowObserver.disconnect()
        }

    }, [authManager, desktop, sources, traffic])

    useAnnouncements(authManager, boundaries.current, traffic)

    useEffect(() => pointer.listen(), [pointer])

    // The process-to-interface leg rides the same tunnel the echoes land on:
    // an end-end arrives as (identity, values) and is posted into its pane in
    // its envelope. The op's own echo shares the event name with a null
    // payload — the type guard tells them apart.
    const inbound = ReactTunnel.useFactory(authManager.processManager.$inbound)

    inbound.useSubscribe("/end-end", useCallback((...results: unknown[]) => {

        const [identity, values] = results

        if (typeof identity !== "string" || !Array.isArray(values)) return

        if ((values[0] === "answer" || values[0] === "wait") && typeof values[1] === "string") boundaries.current.get(identity)?.deliver("end-end", ...values).catch(() => undefined)

        else traffic.emit(identity, "end-end", ...values).catch(() => undefined)

    }, [sources, traffic]))

    // A held Process observes through a separate envelope. The core has
    // already targeted the subscribing process; this desktop offers the
    // copy only to that process's frame, and never puts it on end-end.
    // Observed publications and request answering remain separate routes.
    inbound.useSubscribe("/observed", useCallback((...results: unknown[]) => {

        const [observer, owner, subscription, values] = results

        if (typeof observer !== "string" || typeof owner !== "string" || typeof subscription !== "string" || !Array.isArray(values)) return

        if (frameOwners.current.get(observer) !== owner) return

        traffic.emit(observer, "observed", subscription, ...values).catch(() => undefined)

    }, [sources, traffic]))

    // Destinationless Endpoint events use their own route and therefore never
    // appear in directed traffic observations.
    inbound.useSubscribe("/emitted", useCallback((...results: unknown[]) => {

        const [observer, owner, subscription, values] = results

        if (typeof observer !== "string" || typeof owner !== "string" || typeof subscription !== "string" || !Array.isArray(values)) return

        if (frameOwners.current.get(observer) !== owner) return

        traffic.emit(observer, "emitted", subscription, ...values).catch(() => undefined)

    }, [sources, traffic]))

    // Exact service lifecycle and channel events use their own route. They
    // reach only the frame lease that registered the opaque subscription.
    inbound.useSubscribe("/service-event", useCallback((...results: unknown[]) => {

        const [observer, owner, subscription, values] = results

        if (typeof observer !== "string" || typeof owner !== "string" || typeof subscription !== "string" || !Array.isArray(values)) return

        if (frameOwners.current.get(observer) !== owner) return

        traffic.emit(observer, "service-event", subscription, ...values).catch(() => undefined)

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

            boundaries.current.set(identity, new ClientProcessBoundary(identity, element, authManager, desktopSize, pointer, traffic, localWindow))

            return
        }

        sources.delete(identity)

        const boundary = boundaries.current.get(identity)

        boundaries.current.delete(identity)

        frameOwners.current.delete(identity)

        boundary?.release().catch(() => undefined)

    }, [authManager, desktopSize, localWindow, pointer, sources, traffic])

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
    // the interface's host. Args remain one event tuple across The Link; no
    // nested serialization is introduced inside the transport.
    // A cached iframe may begin executing before passive effects run. Install
    // its boundary listener during the commit, before the browser can run it,
    // so the document's first explicit request cannot disappear.
    useLayoutEffect(function () {

        function onMessage(event: MessageEvent) {

            if (!Array.isArray(event.data)) return

            for (const boundary of boundaries.current.values()) {

                const source = boundary.element

                if (source?.contentWindow !== event.source) continue

                const [bytes, ...attachments] = event.data as unknown[]

                if (!(bytes instanceof Uint8Array)) return

                let message: unknown

                try { message = messagepack.deserialize(bytes, attachments) }

                catch { return }

                if (!Array.isArray(message)) return

                boundary.receive(message)

                return
            }
        }

        window.addEventListener("message", onMessage)

        return () => window.removeEventListener("message", onMessage)

    }, [authManager, pointer, sources])

    return { windowSurfaceRef, windowSurfaceSize, frame, frameLoaded }
}

export type ClientHost = ReturnType<typeof useClientHost>

export interface SurfaceSize {

    width: number

    height: number
}
