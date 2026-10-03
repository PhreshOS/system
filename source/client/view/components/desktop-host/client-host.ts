import { planeSize } from "@client/view/components/window-manager/window-geometry"
import { ReactTunnel } from "@the-link/react"
import useAnnouncements from "./announcements"
import ClientProcessBoundary from "./client-process-boundary"
import ClientTraffic from "./client-traffic"
import { type DesktopViewportHost, type DesktopWindowActions } from "./host"
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import { type Viewport } from "@client/view/structure/desktop/viewport-offset"
import { useReducedMotion } from "@libs/react-motion"
import { type default as AuthManager } from "@client/core/link-manager/auth-manager/auth-manager"
import { type PresentationHost } from "./presentation"
import messagepack from "@the-link/messagepack"

/**
 * The browser boundary between Program frames and the Desktop that hosts them: it carries frame
 * messages, and tells each frame what the Desktop it is drawn in does. The Desktop owns its view and
 * its windows; this boundary only passes them on.
 */
export default function useClientHost(authManager: AuthManager, sources: Map<string, HTMLIFrameElement | null>, presentation: PresentationHost, viewport: Viewport, actions: DesktopWindowActions) {

    const frameOwners = useRef(new Map<string, string>())

    const frameTasks = useRef(new Map<string, Promise<void>>())

    const boundaries = useRef(new Map<string, ClientProcessBoundary>())

    const [traffic] = useState(() => new ClientTraffic())

    const latest = useRef(viewport)

    latest.current = viewport

    // What a Client reaches of this viewport: both values, and moving the view once it is permitted.
    const desktopViewport = useMemo<DesktopViewportHost>(() => ({

        state: () => ({ size: latest.current.size, offset: latest.current.offset }),

        move: offset => latest.current.place(offset)

    }), [])

    // Every Client following this Desktop hears that its view moved, as it sets off, with the motion
    // it takes; with animations off it is there at once. It is told before the move is drawn, so
    // its own motion starts as close as it can to the Desktop's.
    const reducedMotion = useReducedMotion()
    const announcedOffset = useRef(viewport.offset)

    useLayoutEffect(function () {

        if (announcedOffset.current === viewport.offset) return

        announcedOffset.current = viewport.offset

        for (const identity of sources.keys()) {

            traffic.emit(identity, "host-desktop-viewport", "move", { offset: viewport.offset, transaction: reducedMotion ? null : viewport.transaction }).catch(() => undefined)
        }

    }, [viewport.offset, viewport.transaction, reducedMotion, sources, traffic])

    // Every Client hears the Desktop's new size, and the plane's, which grows and shrinks with it.
    const { width, height } = viewport.size

    useLayoutEffect(function () {

        if (!width) return

        for (const identity of sources.keys()) {

            traffic.emit(identity, "host-desktop-viewport", "resize", { width, height }).catch(() => undefined)

            traffic.emit(identity, "host-desktop-plane", "resize", planeSize({ width, height })).catch(() => undefined)
        }

    }, [width, height, sources, traffic])

    useAnnouncements(authManager, boundaries.current, traffic)

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

    // Exact Service lifecycle and application events use their own route. They
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

    const frame = useCallback(function (identity: string, element: HTMLIFrameElement | null) {

        if (element) {

            sources.set(identity, element)

            boundaries.current.get(identity)?.release().catch(() => undefined)

            boundaries.current.set(identity, new ClientProcessBoundary(identity, element, authManager, desktopViewport, actions, traffic, presentation))

            return
        }

        sources.delete(identity)

        const boundary = boundaries.current.get(identity)

        boundaries.current.delete(identity)

        frameOwners.current.delete(identity)

        boundary?.release().catch(() => undefined)

    }, [authManager, desktopViewport, actions, presentation, sources, traffic])

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

    }, [authManager, sources])

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

                try { message = messagepack.deserialize(bytes, { attachments, streams: boundary.relay }) }

                catch { return }

                if (!Array.isArray(message)) return

                // Stream chunks belong to the boundary's relay, not to the endpoint's routes.
                if (message[0] === "boundary" && message[1] === "relay") {

                    boundary.relay.receive(message.slice(2))

                    return
                }

                boundary.receive(message)

                return
            }
        }

        window.addEventListener("message", onMessage)

        return () => window.removeEventListener("message", onMessage)

    }, [authManager, sources])

    return { frame, frameLoaded }
}

export type ClientHost = ReturnType<typeof useClientHost>
