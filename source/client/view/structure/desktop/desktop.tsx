import { type Layer } from "@server/core/link-manager/auth-manager/program-manager/config"
import { useCallback, useEffect, useRef, useState } from "react"
import { ApplicationContext, AuthManagerContext } from "../../contexts"
import useClientHost from "../../components/desktop-host/client-host"
import DesktopDisplay from "./desktop-display"
import useDesktopFocus from "./desktop-focus"
import programIcon from "./programs/program-icon"
import ProgramAccessProbe, { type ProgramAccess } from "../../components/program-access"
import StartMenu from "./taskbar/launcher/start-menu"
import OverflowRow from "./taskbar/programs/overflow-row"
import SignOut from "./taskbar/system/sign-out"
import SystemDialogs from "./taskbar/system/system-dialogs"
import Taskbar from "./taskbar/taskbar"
import WindowTaskbarItem from "./taskbar/programs/window-taskbar-item"
import ProcessWindow from "./windows/process-window"
import useWindows from "../../components/window-manager/window-manager"
import { ReadyWallpaper, WallpaperBackground } from "./wallpaper/wallpaper"
import Loading from "../../components/loading"
import { useRequirement } from "@libs/readiness/main"
import { useAppearance, useResolveTheme, useTheme } from "@phreshos/react-ui"

export default function Workspace() {

    const application = ApplicationContext.useValue()

    const authManager = AuthManagerContext.useValue()

    const appearance = useAppearance()

    const desktopWallpaper = useResolveTheme(appearance.desktopWallpaper)

    const foreground = useResolveTheme(appearance.foreground)

    const theme = useTheme()

    const windows = useWindows(authManager)

    const completePrograms = useRequirement("programs")

    const initialPrograms = useRef<ReadonlySet<string> | null>(null)

    initialPrograms.current ??= new Set(windows.records.map(record => record.identity))

    const [readyPrograms, setReadyPrograms] = useState<ReadonlySet<string>>(() => new Set())

    const [fileWallpaperReady, setFileWallpaperReady] = useState(false)

    const wallpaperReady = fileWallpaperReady

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

    const { windowSurfaceRef, windowSurfaceSize, frame, frameLoaded } = useClientHost(authManager, desktop, sources.current, windows.localWindow)

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

    function icon(record: { assetId: string }) {

        return programIcon(application.doors.program, record.assetId)
    }

    function renderWindows(layer: Layer) {

        return windows.panesByLayer[layer].map(({ identity, record, client, local, closing, entering, stopping }) => <ProcessWindow

            key={identity}

            identity={identity}

            record={record}

            client={client}

            title={local.title}

            icon={icon(record)}

            position={local.position}

            size={local.size}

            localSurface={local.surface}

            geometryAnimation={local.geometryAnimation}

            onLocalAnimationComplete={(kind, revision) => windows.localWindow.complete(record.identity, kind, revision)}

            onLocalRepresentation={windows.localWindow.represent}

            // Only system-painted windows need to know which paint edges
            // touch their surface. Positioning is identical in every layer.
            paintSurfaceSize={layer === "window" ? windowSurfaceSize : undefined}

            depth={local.depth}

            active={fronts[layer]?.identity === record.identity}

            bare={layer !== "window"}

            minimized={local.minimized}

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

    const taskbar = <Taskbar

        leading={<StartMenu />}

        trailing={<SignOut />}

        dialogs={<SystemDialogs />}

        className="z-4"

    >

        {/* What a press means is composed here because it is a person's
            expectation, not a system operation: the front window hides;
            another window is shown and brought forward. */}
        <OverflowRow aria-label="Open windows" backwardLabel="Earlier windows" forwardLabel="Later windows">

            {windows.listed.map(record => <WindowTaskbarItem

                key={record.identity}

                record={record}

                title={record.client!.window.title}

                icon={icon(record)}

                active={!record.client!.window.minimized && fronts.window?.identity === record.identity}

                onElement={focus.taskbarItem}

                onMinimize={focus.minimize}

                onShow={windows.show}

            />)}

        </OverflowRow>

    </Taskbar>

    const wallpaper = <WallpaperBackground file={desktopWallpaper} onReady={fileWallpaperLoaded} />

    return <div ref={desktop} tabIndex={-1} aria-label="Desktop" onFocusCapture={focus.remember} className="relative isolate grid min-h-0 grid-cols-1 grid-rows-1 outline-none" style={{ color: foreground }}>

        <ProgramAccessProbe door={application.doors.program} setAccess={setProgramAccess} />

        <DesktopDisplay

            wallpaper={wallpaper}

            underWindows={renderWindows("under")}

            windows={renderWindows("window")}

            overWindows={renderWindows("over")}

            windowSurfaceRef={windowSurfaceRef}

            taskbar={taskbar}

        />

        {!wallpaperReady && <Loading />}

        {wallpaperReady && <ReadyWallpaper />}

    </div>
}
