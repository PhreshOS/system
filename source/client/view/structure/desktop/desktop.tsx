import { type Layer } from "@phreshos/core"
import { useCallback, useEffect, useRef, useState } from "react"
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

export default function Workspace() {

    const application = ApplicationContext.useValue()

    const authManager = AuthManagerContext.useValue()

    const appearance = useProperty(LinkManagerContext.useValue().appearance)

    const desktopWallpaper = useThemedValue(appearance.desktopWallpaper)

    const foreground = useThemedValue(appearance.colors).foreground

    const { theme } = usePreferences()

    const windows = useWindows(authManager)

    const completePrograms = useRequirement("programs")

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

    const { windowSurfaceRef, windowSurfaceSize, frame, frameLoaded } = useClientHost(authManager, desktop, sources.current, windows.presentation)

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

    const focus = useDesktopFocus(desktop, windows)

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

        return windows.panesByLayer[layer].map(({ identity, record, client, presentation, closing, entering, stopping }) => <ProcessWindow

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

            position={presentation.position}

            size={presentation.size}

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

            onMove={windows.move}

            onResize={windows.resize}

            onSnap={windows.snap}

        />)
    }

    const taskbarOrientation = appearance.taskbar.position === "top" || appearance.taskbar.position === "bottom" ? "horizontal" : "vertical"

    const taskbarItems = <OverflowRow
        orientation={taskbarOrientation}
        className="h-full w-full"
        aria-label="Open windows"
        backwardLabel="Earlier windows"
        forwardLabel="Later windows"
    >

        {/* What a press means is composed here because it is a person's
            expectation, not a system operation: the front window hides;
            another window is shown and brought forward. */}
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
        : <DefaultShell spacing={appearance.spacing} taskbar={appearance.taskbar}>{taskbarItems}</DefaultShell>

    return <div ref={desktop} tabIndex={-1} aria-label="Desktop" onFocusCapture={focus.remember} className="relative isolate h-full min-h-0 w-full overflow-hidden outline-none" style={{ color: foreground }}>

        <ProgramAccessProbe door={application.doors.program} setAccess={setProgramAccess} />

        <DesktopLayers

            wallpaper={wallpaper}

            underWindows={renderWindows("under")}

            windows={renderWindows("window")}

            sharedResizeBoundaries={<SharedResizeBoundaries {...windows.sharedResize} />}

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
