import Process from "@client/core/link-manager/auth-manager/process-manager/process"
import ClientState from "@client/core/link-manager/auth-manager/process-manager/client-state"
import { type WindowSurfaceSize } from "./window-geometry"
import { type LocalAnimation, type LocalSurfaceState } from "../client-host/local-window"
import { type LocalGeometryReader } from "./local-windows"
import { type ProgramAccess } from "../program-access"
import { type Position, type Size } from "@phreshos/core"
import Loading from "../../components/loading"
import Window from "./window"
import ProgramFrame, { programFrameSource } from "../program-frame"
import { memo, type SyntheticEvent, useCallback, useEffect, useState } from "react"

const settleDelay = 80

const loadingExitDuration = 200

/**
 * One process pane at the React boundary. Its primitive window values are
 * props so memoization can see which process actually changed even though
 * the peer deliberately keeps each Process instance alive and mutates it.
 */
export default memo(function ({ identity, record, client, title, icon, position, size, localSurface, geometryAnimation, onLocalAnimationComplete, onLocalRepresentation, paintSurfaceSize, depth, active, minimized, closing, stopping, entering, bare, door, programAccess, onFrame, onFrameLoad, onReady, onRaise, onMinimize, onFill, onClose, onClosed, onUnavailable, onMove, onResize, onSnap }: ProcessWindowProps) {

    const activate = useCallback(() => onRaise(record), [onRaise, record])

    const minimize = useCallback(() => onMinimize(record, true), [onMinimize, record])

    const fill = useCallback(() => onFill(record), [onFill, record])

    const close = useCallback(() => onClose(record), [onClose, record])

    const closed = useCallback(() => onClosed(identity), [identity, onClosed])

    const unavailable = useCallback((reason: "minimize" | "close") => onUnavailable(record, reason), [onUnavailable, record])

    const move = useCallback((x: number, y: number) => onMove(record, x, y), [onMove, record])

    const resize = useCallback((width: number, height: number, origin: { x: number, y: number } | null) => onResize(record, width, height, origin), [onResize, record])

    const snap = useCallback((position: Position, size: Size) => onSnap(record, position, size), [onSnap, record])

    const represent = useCallback((reader: LocalGeometryReader | null) => onLocalRepresentation(record.identity, reader), [onLocalRepresentation, record])

    const frameSource = programFrameSource(record, client, door)

    const [loading, setLoading] = useState<LoadingState>({ source: null, phase: "loading" })

    const loaded = useCallback(function (event: SyntheticEvent<HTMLIFrameElement>) {

        setLoading({ source: frameSource, phase: "settling" })

        onFrameLoad(record.identity, event.currentTarget)

    }, [frameSource, onFrameLoad, record])

    useEffect(function () {

        if (loading.source !== frameSource || loading.phase === "loading" || loading.phase === "hidden") return

        if (loading.phase === "leaving") {

            const hidden = globalThis.setTimeout(() => setLoading({ source: frameSource, phase: "hidden" }), loadingExitDuration)

            return () => globalThis.clearTimeout(hidden)
        }

        let secondFrame = 0

        let settled: ReturnType<typeof setTimeout> | undefined

        const firstFrame = requestAnimationFrame(() => {

            secondFrame = requestAnimationFrame(() => {

                settled = globalThis.setTimeout(() => {

                    setLoading({ source: frameSource, phase: "leaving" })

                    onReady(record.identity)

                }, settleDelay)
            })
        })

        return () => {

            cancelAnimationFrame(firstFrame)

            cancelAnimationFrame(secondFrame)

            if (settled) globalThis.clearTimeout(settled)
        }

    }, [frameSource, loading, onReady, record.identity])

    const loadingVisible = closing || programAccess === "checking" || programAccess === "available" && (loading.source !== frameSource || loading.phase !== "hidden")

    const frameLoading = programAccess === "available" && (loading.source !== frameSource || loading.phase === "loading" || loading.phase === "settling")

    return <Window

        title={title}

        icon={icon}

        position={position}

        size={size}

        localSurface={localSurface}

        geometryAnimation={geometryAnimation}

        onLocalAnimationComplete={onLocalAnimationComplete}

        onLocalRepresentation={represent}

        paintSurfaceSize={paintSurfaceSize}

        active={active}

        bare={bare}

        minimized={minimized}

        closing={closing}

        stopping={stopping}

        animateEntrance={entering}

        data-process-window={record.identity}

        style={{ zIndex: depth }}

        onActivate={activate}

        onMinimize={minimize}

        onMaximize={fill}

        onClose={close}

        onClosed={closed}

        onUnavailable={unavailable}

        onMove={move}

        onResize={resize}

        onSnap={snap}

    >

        {/* A launch names one of its client half's own pages; joining it
            to the program asset route remains the view's responsibility.

            Without allow-same-origin, the pane has an opaque origin and
            cannot reach the desktop document or its authorization. Its
            channel crosses through postMessage and resolves identity from
            this frame, so isolation does not weaken communication. */}
        {!closing && <ProgramFrame

            record={record}

            client={client}

            title={title}

            door={door}

            access={programAccess}

            className={`size-full border-0 ${frameLoading ? "opacity-0" : ""}`}

            onFrame={onFrame}

            onLoad={loaded}

        />}

        {/* Bare layers are only the Program's content. Loading is system paint,
            so it belongs exclusively to an ordinary window. */}
        {!bare && loadingVisible && <Loading

            blur={false}

            className={!closing && loading.source === frameSource && loading.phase === "leaving" ? "pointer-events-none opacity-0 transition-opacity duration-200 ease-out" : ""}

        />}

        {/* First press focuses an inactive window before its program can
            receive input. Bare layers have no system click-catcher. */}
        {!bare && !active && <div className="absolute inset-0" />}

    </Window>
})

interface ProcessWindowProps {

    /** Identity of this Client incarnation, including one retained to animate out. */
    identity: string

    record: Process

    client: ClientState

    title: string

    icon: string

    position: Position

    size: Size

    localSurface: LocalSurfaceState | null

    geometryAnimation: LocalAnimation | null

    onLocalAnimationComplete: (kind: "geometry" | "surface", revision: number) => void

    onLocalRepresentation: (identity: string, reader: LocalGeometryReader | null) => void

    paintSurfaceSize?: WindowSurfaceSize

    depth: number

    active: boolean

    minimized: boolean

    closing: boolean

    stopping: boolean

    entering: boolean

    bare: boolean

    door: string

    programAccess: ProgramAccess

    onFrame: (identity: string, element: HTMLIFrameElement | null) => void

    onFrameLoad: (identity: string, element: HTMLIFrameElement) => void

    onReady: (identity: string) => void

    onRaise: (record: Process) => void

    onMinimize: (record: Process, minimized: boolean) => void

    onFill: (record: Process) => void

    onClose: (record: Process) => void

    onClosed: (identity: string) => void

    onUnavailable: (record: Process, reason: "minimize" | "close") => void

    onMove: (record: Process, x: number, y: number) => void

    onResize: (record: Process, width: number, height: number, position: { x: number, y: number } | null) => void

    onSnap: (record: Process, position: Position, size: Size) => void
}

interface LoadingState {

    source: string | null

    phase: "loading" | "settling" | "leaving" | "hidden"
}
