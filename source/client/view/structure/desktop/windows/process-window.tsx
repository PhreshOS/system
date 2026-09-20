import Process from "@client/core/link-manager/auth-manager/process-manager/process"
import ClientState from "@client/core/link-manager/auth-manager/process-manager/client-state"
import { type WindowSurfaceSize } from "@client/view/components/window-manager/window-geometry"
import { type PresentationAnimation } from "@client/view/components/desktop-host/window-presentation"
import { type PresentationGeometryRepresentation } from "@client/view/components/window-manager/window-presentations"
import { type Position, type Size, type Theme, type WindowFrame, type WindowLayer, type WindowTransaction } from "@phreshos/core"
import Spinner from "@client/view/components/spinner"
import Window from "./window"
import ProgramFrame, { programFrameSource } from "@client/view/components/program-frame"
import { type ProgramAccess } from "@client/view/components/program-access"
import { memo, type SyntheticEvent, useCallback, useEffect, useState } from "react"

const settleDelay = 80

/**
 * One process pane at the React boundary. Its primitive window values are
 * props so memoization can see which process actually changed even though
 * the peer deliberately keeps each Process instance alive and mutates it.
 */
export default memo(function ({ identity, record, assetId, client, title, header, frame, layer, transaction, icon, position, size, frameAnimation, geometryAnimation, minimizeAnimation, onPresentationAnimationComplete, onPresentationRepresentation, paintSurfaceSize, depth, active, minimized, maximized, closing, stopping, entering, door, programAccess, theme, onFrame, onFrameLoad, onReady, onRaise, onMinimize, onFill, onClose, onClosed, onUnavailable, onMove, onResize, onSnap }: ProcessWindowProps) {

    const activate = useCallback(() => onRaise(record), [onRaise, record])

    const minimize = useCallback(() => onMinimize(record, true), [onMinimize, record])

    const fill = useCallback(() => onFill(record), [onFill, record])

    const close = useCallback(() => onClose(record), [onClose, record])

    const closed = useCallback(() => onClosed(identity), [identity, onClosed])

    const unavailable = useCallback((reason: "minimize" | "close") => onUnavailable(record, reason), [onUnavailable, record])

    const move = useCallback((x: number, y: number) => onMove(record, x, y), [onMove, record])

    const resize = useCallback((width: number, height: number, origin: { x: number, y: number } | null) => onResize(record, width, height, origin), [onResize, record])

    const snap = useCallback((position: Position, size: Size) => onSnap(record, position, size), [onSnap, record])

    const represent = useCallback((representation: PresentationGeometryRepresentation | null) => onPresentationRepresentation(record.identity, representation), [onPresentationRepresentation, record])

    const frameSource = programFrameSource(assetId, door)

    const [loading, setLoading] = useState<LoadingState>({ source: null, phase: "loading" })

    const loaded = useCallback(function (event: SyntheticEvent<HTMLIFrameElement>) {

        setLoading({ source: frameSource, phase: "settling" })

        onFrameLoad(record.identity, event.currentTarget)

    }, [frameSource, onFrameLoad, record])

    useEffect(function () {

        if (loading.source !== frameSource || loading.phase !== "settling") return

        let secondFrame = 0

        let settled: ReturnType<typeof setTimeout> | undefined

        const firstFrame = requestAnimationFrame(() => {

            secondFrame = requestAnimationFrame(() => {

                settled = globalThis.setTimeout(() => {

                    setLoading({ source: frameSource, phase: "ready" })

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

    const frameLoading = programAccess === "available" && (loading.source !== frameSource || loading.phase !== "ready")

    const framed = layer === "window" || (layer === "under" || layer === "over") && frame !== false

    const progress = framed && (stopping || closing ? "Closing" : frameLoading ? "Loading" : null)

    return <Window

        title={title}

        header={header}

        frame={frame}

        layer={layer}

        transaction={transaction}

        icon={icon}

        position={position}

        size={size}

        frameAnimation={frameAnimation}

        geometryAnimation={geometryAnimation}

        minimizeAnimation={minimizeAnimation}

        onPresentationAnimationComplete={onPresentationAnimationComplete}

        onPresentationRepresentation={represent}

        paintSurfaceSize={paintSurfaceSize}

        active={active}

        minimized={minimized}

        maximized={maximized}

        closing={closing}

        stopping={stopping}

        entering={entering}

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
            to the program asset route remains the view's responsibility. */}
        {!stopping && !closing && <ProgramFrame

            record={record}

            assetId={assetId}

            client={client}

            title={title}

            door={door}

            access={programAccess}

            theme={theme}

            className={`size-full border-0 ${frameLoading ? "opacity-0" : ""}`}

            onFrame={onFrame}

            onLoad={loaded}

        />}

        {/* Loading and closing are mutually exclusive states of the same
            progress layer. Neither paints a backdrop or Surface. */}
        {progress && <div className="pointer-events-none absolute inset-0 z-10 grid rounded-[inherit]">

            <Spinner className="m-auto size-6">

                <span className="sr-only">{progress}</span>

            </Spinner>

        </div>}

        {/* First press focuses an inactive window before its program can
            receive input. Bare layers have no system click-catcher. */}
        {layer === "window" && !active && <div data-window-click-catcher className="absolute inset-0 bg-transparent" />}

    </Window>
})

interface ProcessWindowProps {

    /** Identity of this Client incarnation, including one retained to animate out. */
    identity: string

    record: Process

    assetId: string

    client: ClientState

    title: string

    header: boolean

    frame: WindowFrame

    layer: WindowLayer

    transaction: WindowTransaction

    icon: string

    position: Position

    size: Size

    frameAnimation: PresentationAnimation | null

    geometryAnimation: PresentationAnimation | null

    minimizeAnimation: PresentationAnimation | null

    onPresentationAnimationComplete: (kind: "geometry" | "minimize" | "frame", revision: number) => void

    onPresentationRepresentation: (identity: string, representation: PresentationGeometryRepresentation | null) => void

    paintSurfaceSize?: WindowSurfaceSize

    depth: number

    active: boolean

    minimized: boolean

    maximized: boolean

    closing: boolean

    stopping: boolean

    entering: boolean

    door: string

    programAccess: ProgramAccess

    theme: Theme

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

    phase: "loading" | "settling" | "ready"
}
