import Process from "@client/core/link-manager/auth-manager/process-manager/process"
import ClientState from "@client/core/link-manager/auth-manager/process-manager/client-state"
import { type WindowSurfaceSize } from "@client/view/components/window-manager/window-geometry"
import { type PresentationAnimation, type PresentationMoveGestureController } from "@client/view/components/desktop-host/window-presentation"
import { type PresentationGeometryRepresentation } from "@client/view/components/window-manager/window-presentations"
import { type Position, type Size, type TaskbarPosition, type Theme, type WindowPresentationSurface, type WindowLayer } from "@phreshos/core"
import Spinner from "@client/view/components/spinner"
import Window from "./window"
import ProgramFrame, { programFrameSource } from "@client/view/components/program-frame"
import { type ProgramAccess } from "@client/view/components/program-access"
import { memo, type SyntheticEvent, useCallback, useEffect, useState } from "react"

const settleDelay = 80

export function processWindowProgress(layer: WindowLayer, loading: boolean, stopping: boolean, closing: boolean) {

    if (layer !== "window") return null

    return stopping || closing ? "Closing" : loading ? "Loading" : null
}

/**
 * One process pane at the React boundary. Its primitive window values are
 * props so memoization can see which process actually changed even though
 * the peer deliberately keeps each Process instance alive and mutates it.
 */
export default memo(function ({ identity, record, assetId, client, title, header, surface, layer, icon, position, size, taskbarPosition, surfaceAnimation, geometryAnimation, minimizeAnimation, onPresentationAnimationComplete, onPresentationRepresentation, onPresentationMoveGesture, paintSurfaceSize, spacing, depth, active, minimized, maximized, interactive, closing, stopping, entering, door, programAccess, theme, onFrame, onFrameLoad, onReady, onRaise, onMinimize, onFill, onClose, onClosed, onUnavailable, onMove, onResize, onSnap }: ProcessWindowProps) {

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

    const moveGesture = useCallback((controller: PresentationMoveGestureController | null) => onPresentationMoveGesture(record.identity, controller), [onPresentationMoveGesture, record])

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

    // Raw layers belong to their Programs. Desktop progress paint is part of
    // the standard Window representation and must never cover raw content.
    const progress = processWindowProgress(layer, frameLoading, stopping, closing)

    return <Window

        title={title}

        header={header}

        surface={surface}

        layer={layer}

        icon={icon}

        position={position}

        size={size}

        taskbarPosition={taskbarPosition}

        surfaceAnimation={surfaceAnimation}

        geometryAnimation={geometryAnimation}

        minimizeAnimation={minimizeAnimation}

        onPresentationAnimationComplete={onPresentationAnimationComplete}

        onPresentationRepresentation={represent}

        onPresentationMoveGesture={moveGesture}

        paintSurfaceSize={paintSurfaceSize}

        spacing={spacing}

        active={active}

        minimized={minimized}

        maximized={maximized}

        interactive={interactive}

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

    surface: WindowPresentationSurface

    layer: WindowLayer

    icon: string

    position: Position

    size: Size

    /** Desktop-owned presentation destination for minimizing standard Windows. */
    taskbarPosition: TaskbarPosition

    surfaceAnimation: PresentationAnimation | null

    geometryAnimation: PresentationAnimation | null

    minimizeAnimation: PresentationAnimation | null

    onPresentationAnimationComplete: (kind: "geometry" | "minimize" | "surface", revision: number) => void

    onPresentationRepresentation: (identity: string, representation: PresentationGeometryRepresentation | null) => void

    onPresentationMoveGesture: (identity: string, controller: PresentationMoveGestureController | null) => void

    paintSurfaceSize?: WindowSurfaceSize

    spacing: number

    depth: number

    active: boolean

    minimized: boolean

    maximized: boolean

    interactive: boolean

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

    onFill: (record: Process) => Promise<boolean>

    onClose: (record: Process) => void

    onClosed: (identity: string) => void

    onUnavailable: (record: Process, reason: "minimize" | "close") => void

    onMove: (record: Process, x: number, y: number) => Promise<boolean>

    onResize: (record: Process, width: number, height: number, position: { x: number, y: number } | null) => Promise<boolean>

    onSnap: (record: Process, position: Position, size: Size) => Promise<boolean>
}

interface LoadingState {

    source: string | null

    phase: "loading" | "settling" | "ready"
}
