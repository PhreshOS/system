import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ApplicationContext, AuthManagerContext, LinkManagerContext } from "../../contexts"
import useClientHost from "../../components/desktop-host/client-host"
import DesktopLayers, { desktopMargins } from "./layers/desktop-layers"
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
import { CellShiftStore, PlaneSlide, PlaneSlideContext, ViewCellShift, usePlaneSlide } from "./plane-slide"
import { useViewTravel } from "./edge-hold"
import { boundedGeometry, planeGeometry, recordedPosition, resolveWindowGeometry, shiftPosition, viewOfGeometry, type WindowRegion } from "@client/view/components/window-manager/window-geometry"
import { type MappedWindow } from "./layers/shell/taskbar/viewport/viewport-control"
import type Process from "@client/core/link-manager/auth-manager/process-manager/process"
import { type Layer, type Position, type PresentationAnchor, type Size } from "@phreshos/core"

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
    const { offset, views } = viewport

    // Recorded in views, so a Window stays in its view on a Desktop of any size.
    const back = { x: views.x, y: views.y }

    // Drawings fixed to the plane are shown against where this Desktop looks, in pixels.
    useLayoutEffect(() => windows.presentation.follow(offset), [windows.presentation, offset.x, offset.y])

    /** Where a raw drawing is shown: fixed to the viewport as written, or fixed to the plane and moved by the viewport. */
    function shownRaw(position: Position, anchor: PresentationAnchor): Position {
        if (anchor === "viewport" || typeof position.x !== "number" || typeof position.y !== "number") return position
        return { x: position.x - offset.x, y: position.y - offset.y }
    }

    // Standard Windows measure in the whole Desktop; the space they keep from its edges is painted.
    const margins = useMemo(() => desktopMargins(appearance.spacing, appearance.taskbar), [appearance.spacing, appearance.taskbar])

    // A Window rerenders only when what it shows changes: each position keeps one shown form per offset.
    const shownPositions = useMemo(() => new WeakMap<Position, Position>(), [views.x, views.y])

    function shownPosition(position: Position) {

        const cached = shownPositions.get(position)

        if (cached) return cached

        const shown = shiftPosition(position, { x: -views.x, y: -views.y })

        shownPositions.set(position, shown)

        return shown
    }

    // A maximized Window fills the whole view its geometry is in: shown where that view is from this one.
    const maximizedPositions = useMemo(() => new Map<string, Position>(), [views.x, views.y])

    function maximizedPosition(position: Position, size: Size) {

        const view = viewOfGeometry(position, size, windowSurfaceSize)

        const key = `${view.x},${view.y}`

        let shown = maximizedPositions.get(key)

        if (!shown) maximizedPositions.set(key, shown = shiftPosition({ x: "-1/2", y: "-1/2" }, { x: view.x - views.x, y: view.y - views.y }))

        return shown
    }

    const move = useCallback(function (record: Process, x: number, y: number) {

        // A raw drawing moved by hand stays this Desktop's drawing; only a standard Window's place is the System's.
        // One fixed to the plane is written where it is on the plane.
        const drawn = windows.presentation.projection(record.identity)
        if (drawn.layer !== "window") {
            const from = drawn.anchor === "plane" ? offset : { x: 0, y: 0 }
            return windows.presentation.move(record.identity, { x: x + from.x, y: y + from.y }).then(() => true)
        }

        const recorded = shiftPosition({ x, y }, back)

        return windows.move(record, recorded.x, recorded.y)

    }, [windows.move, windows.presentation, back.x, back.y, offset.x, offset.y])

    const resize = useCallback((record: Process, width: number, height: number, position: { x: number, y: number } | null) => windows.resize(record, width, height, position && shiftPosition(position, back)), [windows.resize, back.x, back.y])

    const snap = useCallback((record: Process, position: Position, size: Size) => windows.snap(record, shiftPosition(position, back), size), [windows.snap, back.x, back.y])

    const commitSharedResize = useCallback((geometries: ReadonlyMap<string, WindowRegion>) => windows.sharedResize.commit(new Map([...geometries].map(([identity, region]) => [identity, { ...region, ...shiftPosition(region, back) }]))), [windows.sharedResize.commit, back.x, back.y])

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

        return programIcon(application.doors.program, assetOf(record.program))
    }

    // A Program can leave while one of its Windows is still leaving, as when `phresh start` ends and its
    // attached Program is forgotten at once. The leaving Window keeps what it showed.
    const knownAssets = useRef(new Map<string, string>())

    function assetOf(identity: string) {

        const found = authManager.programManager.programs.get(identity)

        if (found) knownAssets.current.set(identity, found.assetId)

        return found?.assetId ?? knownAssets.current.get(identity) ?? ""
    }

    /**
     * Where every other open standard Window stands in this view, for a Window that reaches toward
     * its neighbours. Read when asked, so it is always what is drawn now; the callback itself stays
     * the same, so it does not redraw the Windows it is given to.
     */
    const neighboursNow = useRef<(identity: string) => readonly WindowRegion[]>(() => [])

    neighboursNow.current = identity => windows.panesByLayer.window
        .filter(pane => pane.identity !== identity && !pane.closing && !pane.presentation.minimized)
        .map(pane => {
            const bounded = boundedGeometry(pane.presentation.position, pane.presentation.size, windowSurfaceSize)
            return resolveWindowGeometry(shownPosition(bounded.position), bounded.size, windowSurfaceSize)
        })

    const neighboursOf = useCallback((identity: string) => neighboursNow.current(identity), [])

    // What lives on the plane glides with the view; see usePlaneSlide.
    const slide = usePlaneSlide(viewport.views, viewport.transaction, windowSurfaceSize)

    // How far the shown view is from the grid of whole views: Windows paint their margins at the
    // edges of their own view, wherever the Desktop looks from.
    const [cellShift] = useState(() => new CellShiftStore())

    cellShift.take({
        x: (views.x - Math.round(views.x)) * windowSurfaceSize.width,
        y: (views.y - Math.round(views.y)) * windowSurfaceSize.height
    })

    useLayoutEffect(() => cellShift.announce(), [cellShift, views.x, views.y, windowSurfaceSize.width, windowSurfaceSize.height])

    // A Window held against an edge takes the view one whole view that way; see useViewTravel.
    const edgeHold = useViewTravel(viewport)

    /** A layer whose drawings may be fixed to the viewport or to the plane: only the second glide with the view. */
    function renderAnchored(layer: "under" | "over") {

        return <>
            {renderWindows(layer, "viewport")}
            <PlaneSlide slide={slide}>{renderWindows(layer, "plane")}</PlaneSlide>
        </>
    }

    function renderWindows(layer: Layer, anchor?: PresentationAnchor) {

        return windows.panesByLayer[layer].filter(({ presentation }) => anchor === undefined || presentation.anchor === anchor).map(({ identity, record, client, presentation, closing, entering, stopping }) => {

            const bounded = boundedGeometry(presentation.position, presentation.size, windowSurfaceSize)

            return <ProcessWindow

            key={identity}

            identity={identity}

            record={record}

            assetId={assetOf(record.program)}

            client={client}

            title={presentation.title}

            header={presentation.header}

            surface={presentation.surface}

            layer={presentation.layer}

            icon={icon(record)}

            position={presentation.layer === "window" ? shownPosition(bounded.position) : shownRaw(presentation.position, presentation.anchor)}

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

            paintMargins={layer === "window" ? margins : undefined}

            spacing={appearance.spacing}

            depth={presentation.depth}

            active={fronts[layer]?.identity === record.identity}

            minimized={presentation.minimized}

            maximized={presentation.maximized}

            maximizedPosition={presentation.layer === "window" ? maximizedPosition(bounded.position, bounded.size) : undefined}

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

            onEdgeHold={layer === "window" ? edgeHold : undefined}

            onNeighbours={layer === "window" ? neighboursOf : undefined}

        />
        })
    }

    const taskbarOrientation = appearance.taskbar.position === "top" || appearance.taskbar.position === "bottom" ? "horizontal" : "vertical"

    // Each standard Window where it is on the plane, minimized or not, for the map of views.
    const mappedWindows: MappedWindow[] = windowSurfaceSize.width && windowSurfaceSize.height
        ? windows.panesByLayer.window.filter(pane => !pane.closing).map(({ identity, record, presentation }) => {

            const shown = boundedGeometry(presentation.position, presentation.size, windowSurfaceSize)

            const region = planeGeometry(resolveWindowGeometry(shown.position, shown.size, windowSurfaceSize), windowSurfaceSize)

            return {
                identity,
                title: presentation.title,
                icon: icon(record),
                region,
                front: fronts.window?.identity === record.identity,
                minimized: presentation.minimized,
                maximized: presentation.maximized,
                show: () => show(record),
                bringHere: () => bringHere(record),
                toggleMinimized: () => toggleMinimized(record),
                fill: () => void windows.fill(record),
                close: () => focus.close(record),
                moveTo: center => {

                    const recorded = recordedPosition({ x: center.x - region.width / 2, y: center.y - region.height / 2 }, windowSurfaceSize)

                    void windows.move(record, recorded.x, recorded.y)
                }
            }
        })
        : []

    // A Window launched from this Desktop without a size of its own gets a square: three fifths of the
    // view's shorter side. Shares of the view would stretch it with the screen's own proportions.
    function launchSize(): Size {

        const side = Math.round(Math.min(windowSurfaceSize.width, windowSurfaceSize.height) * 0.6)

        return { width: side, height: side }
    }

    // A Window launched from this Desktop opens centered in what it shows, each one stepped a little from
    // the Windows already in view, so none lands exactly on another.
    const place = useCallback(function (declared: Size | null) {

        const size = declared ?? launchSize()

        const shown = resolveWindowGeometry({ x: 0, y: 0 }, size, windowSurfaceSize)

        const inView = mappedWindows.filter(({ region }) =>
            Math.abs(region.x + region.width / 2 - offset.x) < windowSurfaceSize.width / 2 &&
            Math.abs(region.y + region.height / 2 - offset.y) < windowSurfaceSize.height / 2).length

        const step = inView % 8 * appearance.spacing * 2

        const position = recordedPosition({ x: offset.x - shown.width / 2 + step, y: offset.y - shown.height / 2 + step }, windowSurfaceSize)

        return declared ? { position } : { position, size }

    }, [mappedWindows, offset.x, offset.y, windowSurfaceSize, appearance.spacing])

    /**
     * Moves the view to the whole view a Window at this position and size is in. It never centers on the
     * Window itself: a view resting between two would put a maximized Window, which fills its own view,
     * off the screen's edges. Moving within or between views stays the person's choice.
     */
    const reveal = useCallback(function (position: Position, size: Size | null) {

        if (!windowSurfaceSize.width || !windowSurfaceSize.height) return

        const shown = boundedGeometry(position, size ?? { width: 0, height: 0 }, windowSurfaceSize)

        viewport.moveTo(viewOfGeometry(shown.position, shown.size, windowSurfaceSize))

    }, [windowSurfaceSize, viewport.moveTo])

    const launchPlacement = useMemo<LaunchPlacement>(() => ({ place, reveal }), [place, reveal])

    // Going to a Window brings the view to the view it is in, whether it was minimized or only out of
    // view, and brings it to the front.
    const show = useCallback(function (record: Process) {

        const window = windows.presentation.projection(record.identity)

        if (window.layer === "window") reveal(window.position, window.size)

        windows.show(record)

    }, [windows.presentation, windows.show, reveal])

    // Bringing a Window here moves it by whole views into the view on screen, so it keeps its place
    // within a view: a Window on the left half arrives on the left half, a maximized one fills this view.
    const bringHere = useCallback(function (record: Process) {

        const window = windows.presentation.projection(record.identity)

        if (window.layer !== "window") return

        const shown = boundedGeometry(window.position, window.size, windowSurfaceSize)

        const from = viewOfGeometry(shown.position, shown.size, windowSurfaceSize)

        const brought = shiftPosition(shown.position, { x: viewport.view.x - from.x, y: viewport.view.y - from.y })

        void windows.move(record, brought.x, brought.y)

        windows.show(record)

    }, [windows.presentation, windows.move, windows.show, viewport.view.x, viewport.view.y, windowSurfaceSize])

    // Showing and hiding in place, as the Taskbar does.
    const toggleMinimized = useCallback(function (record: Process) {

        if (windows.presentation.projection(record.identity).minimized) windows.show(record)

        else focus.minimize(record, true)

    }, [windows.presentation, windows.show, focus.minimize])

    const taskbarItems = <OverflowRow
        orientation={taskbarOrientation}
        className="h-full w-full"
        aria-label="Open windows"
        backwardLabel="Earlier windows"
        forwardLabel="Later windows"
    >

        {/* What a press means is composed here because it is a person's
            expectation, not a system operation: the front window hides;
            pressing another takes you to its view and brings it forward. */}
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

                onShow={windows.show}

                onGoTo={show}

                onBringHere={bringHere}

                onFill={windows.fill}

                onClose={focus.close}

            />
        })}

    </OverflowRow>

    const wallpaper = hasWallpaperClient
        ? renderWindows("wallpaper")
        : <WallpaperBackground place="desktop" file={desktopWallpaper} onReady={fileWallpaperLoaded} />

    const shell = hasShellClient
        ? renderWindows("shell")
        : <LaunchPlacementContext.Provider value={launchPlacement}>
            <DefaultShell spacing={appearance.spacing} taskbar={appearance.taskbar} viewport={viewport} mappedWindows={mappedWindows}>{taskbarItems}</DefaultShell>
        </LaunchPlacementContext.Provider>

    return <div ref={desktop} tabIndex={-1} aria-label="Desktop" onFocusCapture={focus.remember} className="relative isolate h-full min-h-0 w-full overflow-hidden outline-none" style={{ color: foreground }}>

        <ProgramAccessProbe door={application.doors.program} setAccess={setProgramAccess} />

        <PlaneSlideContext.Provider value={slide}>
        <ViewCellShift.Provider value={cellShift}>
        <DesktopLayers

            wallpaper={wallpaper}

            underWindows={renderAnchored("under")}

            windows={<PlaneSlide slide={slide}>{renderWindows("window")}</PlaneSlide>}

            sharedResizeBoundaries={<PlaneSlide slide={slide}><SharedResizeBoundaries {...windows.sharedResize} commit={commitSharedResize} /></PlaneSlide>}

            overWindows={renderAnchored("over")}

            windowSurfaceRef={windowSurfaceRef}

            spacing={appearance.spacing}

            shell={<>
                {shell}
                {!wallpaperReady && <Loading />}
            </>}

        />
        </ViewCellShift.Provider>
        </PlaneSlideContext.Provider>

        {wallpaperReady && <ReadyWallpaper />}

    </div>
}
