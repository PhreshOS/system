import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ApplicationContext, AuthManagerContext, LinkManagerContext } from "../../contexts"
import useClientHost from "../../components/desktop-host/client-host"
import DesktopLayers from "./layers/desktop-layers"
import useDesktopFocus from "./desktop-focus"
import programIcon from "./programs/program-icon"
import ProgramAccessProbe, { type ProgramAccess } from "../../components/program-access"
import DefaultShell from "./layers/shell/default-shell"
import OverflowRow from "./layers/shell/taskbar/programs/overflow-row"
import WindowTaskbarItem from "./layers/shell/taskbar/programs/window-taskbar-item"
import ProcessWindow from "./windows/process-window"
import useWindows from "../../components/window-manager/window-manager"
import { ReadyWallpaper, WallpaperBackground } from "./layers/wallpaper/wallpaper"
import Loading from "../../components/loading"
import { useRequirement } from "@libs/readiness"
import { usePreferences, useThemedValue } from "@phreshos/react-ui"
import { useProperty } from "@the-link/react"
import SharedResizeBoundaries from "./windows/shared-resize-boundaries"
import { programsRequirement } from "../readiness-requirements"
import { LaunchPlacementContext, type LaunchPlacement } from "./launch-placement"
import { boundedGeometry, planeGeometry, resolveWindowGeometry, shiftPosition, shownSize, type WindowRegion } from "@client/view/components/window-manager/window-geometry"
import { type MappedWindow } from "./layers/shell/taskbar/viewport/viewport-control"
import type Process from "@client/core/link-manager/auth-manager/process-manager/process"
import { type Layer, type Position, type Size } from "@phreshos/core"

export default function Workspace() {

    const application = ApplicationContext.useValue()

    const authManager = AuthManagerContext.useValue()

    const appearance = useProperty(LinkManagerContext.useValue().appearance)

    const desktopWallpaper = useThemedValue(appearance.desktopWallpaper)

    const foreground = useThemedValue(appearance.colors).foreground

    const { theme } = usePreferences()

    const windows = useWindows(authManager)

    const completePrograms = useRequirement(programsRequirement)

    const initialPrograms = useRef<ReadonlySet<string> | null>(null)

    initialPrograms.current ??= new Set(windows.records.map(record => record.identity))

    const [readyPrograms, setReadyPrograms] = useState<ReadonlySet<string>>(() => new Set())

    const [fileWallpaperReady, setFileWallpaperReady] = useState(false)

    const hasWallpaperClient = windows.records.some(record => record.client?.window.layer === "wallpaper")
    const hasShellClient = windows.records.some(record => record.client?.window.layer === "shell")
    const wallpaperReady = hasWallpaperClient || fileWallpaperReady

    const desktop = useRef<HTMLDivElement>(null)

    const [programAccess, setProgramAccess] = useState<ProgramAccess>("checking")

    const currentPrograms = new Set(windows.records.map(record => record.identity))

    const initialProgramsReady = programAccess === "blocked" || [...initialPrograms.current].every(identity => readyPrograms.has(identity) || !currentPrograms.has(identity))

    useEffect(function () {

        if (initialProgramsReady) completePrograms()

    }, [completePrograms, initialProgramsReady])

    // Each frame, by process identity. This resolves a message's sender and
    // lets the desktop announce the surface that actually contains it.
    const sources = useRef(new Map<string, HTMLIFrameElement | null>())

    const { windowSurfaceRef, windowSurfaceSize, viewport, frame, frameLoaded } = useClientHost(authManager, desktop, sources.current, windows.presentation)

    // Standard Windows are shown moved by this Desktop's offset, and what is done to them is recorded
    // moved back. Nothing else knows it: a Window works only in what it shows.
    const { offset } = viewport

    const back = { x: offset.x, y: offset.y }

    // A Window rerenders only when what it shows changes: each position keeps one shown form per offset.
    const shownPositions = useMemo(() => new WeakMap<Position, Position>(), [offset.x, offset.y])

    function shownPosition(position: Position) {

        const cached = shownPositions.get(position)

        if (cached) return cached

        const shown = shiftPosition(position, { x: -offset.x, y: -offset.y })

        shownPositions.set(position, shown)

        return shown
    }

    const move = useCallback((record: Process, x: number, y: number) => windows.move(record, x + back.x, y + back.y), [windows.move, back.x, back.y])

    const resize = useCallback((record: Process, width: number, height: number, position: { x: number, y: number } | null) => windows.resize(record, width, height, position && { x: position.x + back.x, y: position.y + back.y }), [windows.resize, back.x, back.y])

    const snap = useCallback((record: Process, position: Position, size: Size) => windows.snap(record, shiftPosition(position, back), size), [windows.snap, back.x, back.y])

    const commitSharedResize = useCallback((geometries: ReadonlyMap<string, WindowRegion>) => windows.sharedResize.commit(new Map([...geometries].map(([identity, region]) => [identity, { ...region, x: region.x + back.x, y: region.y + back.y }]))), [windows.sharedResize.commit, back.x, back.y])

    const fileWallpaperLoaded = useCallback(() => {

        setFileWallpaperReady(true)
    }, [])

    const programReady = useCallback(function (identity: string) {

        if (!initialPrograms.current?.has(identity)) return

        setReadyPrograms(current => {

            if (current.has(identity)) return current

            return new Set([...current, identity])
        })

    }, [])

    const focus = useDesktopFocus(desktop, windows, appearance.taskbar.overlay)

    // Resolved once per desktop render. Asking inside every window and
    // taskbar item would repeat the same linear scan for each process.
    const fronts = windows.fronts

    function icon(record: { program: string }) {

        return programIcon(application.doors.program, program(record.program).assetId)
    }

    function program(identity: string) {

        const found = authManager.programManager.programs.get(identity)

        if (!found) throw new Error(`The Program "${identity}" does not exist`)

        return found
    }

    function renderWindows(layer: Layer) {

        return windows.panesByLayer[layer].map(({ identity, record, client, presentation, closing, entering, stopping }) => {

            const bounded = boundedGeometry(presentation.position, shownSize(presentation.size), windowSurfaceSize)

            return <ProcessWindow

            key={identity}

            identity={identity}

            record={record}

            assetId={program(record.program).assetId}

            client={client}

            title={presentation.title}

            header={presentation.header}

            surface={presentation.surface}

            layer={presentation.layer}

            icon={icon(record)}

            position={presentation.layer === "window" ? shownPosition(bounded.position) : presentation.position}

            size={presentation.layer === "window" ? bounded.size : presentation.size}

            taskbarPosition={appearance.taskbar.position}

            surfaceAnimation={presentation.surfaceAnimation}

            geometryAnimation={presentation.geometryAnimation}

            minimizeAnimation={presentation.minimizeAnimation}

            onPresentationAnimationComplete={(kind, revision) => windows.presentation.complete(record.identity, kind, revision)}

            onPresentationRepresentation={windows.presentation.represent}

            onPresentationMoveGesture={windows.presentation.registerMoveGesture}

            // Only system-painted windows need to know which paint edges
            // touch their surface. Positioning is identical in every layer.
            paintSurfaceSize={layer === "window" ? windowSurfaceSize : undefined}

            spacing={appearance.spacing}

            depth={presentation.depth}

            active={fronts[layer]?.identity === record.identity}

            minimized={presentation.minimized}

            maximized={presentation.maximized}

            interactive={presentation.interactive}

            closing={closing}

            stopping={stopping}

            entering={entering}

            door={application.doors.program}

            programAccess={programAccess}

            theme={theme}

            onFrame={frame}

            onFrameLoad={frameLoaded}

            onReady={programReady}

            onRaise={windows.raise}

            onMinimize={focus.minimize}

            onFill={windows.fill}

            onClose={focus.close}

            onClosed={windows.closed}

            onUnavailable={focus.unavailable}

            onMove={move}

            onResize={resize}

            onSnap={snap}

        />
        })
    }

    const taskbarOrientation = appearance.taskbar.position === "top" || appearance.taskbar.position === "bottom" ? "horizontal" : "vertical"

    // Each standard Window where it is on the plane, for the map of views.
    const mappedWindows: MappedWindow[] = windowSurfaceSize.width && windowSurfaceSize.height
        ? windows.panesByLayer.window.filter(pane => !pane.presentation.minimized).map(({ identity, record, presentation }) => {

            const shown = boundedGeometry(presentation.position, shownSize(presentation.size), windowSurfaceSize)

            const region = planeGeometry(resolveWindowGeometry(shown.position, shown.size, windowSurfaceSize), windowSurfaceSize)

            return {
                identity,
                title: presentation.title,
                icon: icon(record),
                region,
                front: fronts.window?.identity === record.identity,
                show: () => show(record),
                close: () => focus.close(record),
                moveTo: center => void windows.move(record, Math.round(center.x - region.width / 2), Math.round(center.y - region.height / 2))
            }
        })
        : []

    // A Window launched from this Desktop opens centered in what it shows, each one stepped a little from
    // the Windows already in view, so none lands exactly on another.
    const place = useCallback(function (size: Size | null): Position {

        const shown = resolveWindowGeometry({ x: 0, y: 0 }, shownSize(size ?? { width: 0, height: 0 }), windowSurfaceSize)

        const inView = mappedWindows.filter(({ region }) =>
            Math.abs(region.x + region.width / 2 - offset.x) < windowSurfaceSize.width / 2 &&
            Math.abs(region.y + region.height / 2 - offset.y) < windowSurfaceSize.height / 2).length

        const step = inView % 8 * appearance.spacing * 2

        return { x: Math.round(offset.x - shown.width / 2 + step), y: Math.round(offset.y - shown.height / 2 + step) }

    }, [mappedWindows, offset.x, offset.y, windowSurfaceSize, appearance.spacing])

    /** Centers the view on a Window at this position and size, as the Desktop shows it. */
    const reveal = useCallback(function (position: Position, size: Size | null) {

        if (!windowSurfaceSize.width || !windowSurfaceSize.height) return

        const shown = boundedGeometry(position, shownSize(size ?? { width: 0, height: 0 }), windowSurfaceSize)

        const region = planeGeometry(resolveWindowGeometry(shown.position, shown.size, windowSurfaceSize), windowSurfaceSize)

        viewport.place({ x: region.x + region.width / 2, y: region.y + region.height / 2 })

    }, [windowSurfaceSize, viewport.place])

    const launchPlacement = useMemo<LaunchPlacement>(() => ({ place, reveal }), [place, reveal])

    // Pressing a Window in the Taskbar brings the view to it, so it is in the middle, whether it was
    // minimized or only out of view. A maximized Window fills every view, so the view stays.
    const show = useCallback(function (record: Process) {

        const window = windows.presentation.projection(record.identity)

        if (window.layer === "window" && !window.maximized) reveal(window.position, window.size)

        windows.show(record)

    }, [windows.presentation, windows.show, reveal])

    const taskbarItems = <OverflowRow
        orientation={taskbarOrientation}
        className="h-full w-full"
        aria-label="Open windows"
        backwardLabel="Earlier windows"
        forwardLabel="Later windows"
    >

        {/* What a press means is composed here because it is a person's
            expectation, not a system operation: the view goes to the Window,
            which is shown and brought forward. */}
        {windows.listed.map(record => {

            const window = windows.presentation.projection(record.identity)

            return <WindowTaskbarItem

                key={record.identity}

                record={record}

                title={window.title}

                icon={icon(record)}

                position={appearance.taskbar.position}

                active={fronts.window?.identity === record.identity}

                minimized={window.minimized}

                maximized={window.maximized}

                onElement={focus.taskbarItem}

                onMinimize={focus.minimize}

                onShow={show}

                onFill={windows.fill}

                onClose={focus.close}

            />
        })}

    </OverflowRow>

    const wallpaper = hasWallpaperClient
        ? renderWindows("wallpaper")
        : <WallpaperBackground file={desktopWallpaper} onReady={fileWallpaperLoaded} />

    const shell = hasShellClient
        ? renderWindows("shell")
        : <LaunchPlacementContext.Provider value={launchPlacement}>
            <DefaultShell spacing={appearance.spacing} taskbar={appearance.taskbar} viewport={viewport} mappedWindows={mappedWindows}>{taskbarItems}</DefaultShell>
        </LaunchPlacementContext.Provider>

    return <div ref={desktop} tabIndex={-1} aria-label="Desktop" onFocusCapture={focus.remember} className="relative isolate h-full min-h-0 w-full overflow-hidden outline-none" style={{ color: foreground }}>

        <ProgramAccessProbe door={application.doors.program} setAccess={setProgramAccess} />

        <DesktopLayers

            wallpaper={wallpaper}

            underWindows={renderWindows("under")}

            windows={renderWindows("window")}

            sharedResizeBoundaries={<SharedResizeBoundaries {...windows.sharedResize} commit={commitSharedResize} />}

            overWindows={renderWindows("over")}

            windowSurfaceRef={windowSurfaceRef}

            spacing={appearance.spacing}

            taskbar={appearance.taskbar}

            shell={<>
                {shell}
                {!wallpaperReady && <Loading />}
            </>}

        />

        {wallpaperReady && <ReadyWallpaper />}

    </div>
}
