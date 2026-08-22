import { type Layer } from "@server/core/link-manager/auth-manager/program-manager/config"
import { type SyntheticEvent, useCallback, useEffect, useRef, useState } from "react"
import { ApplicationContext, AuthManagerContext } from "../contexts"
import useClientHost from "./client-host/client-host"
import DesktopDisplay from "./desktop-display"
import useDesktopFocus from "./desktop-focus"
import programIcon from "./programs/program-icon"
import ProgramAccessProbe, { type ProgramAccess } from "./program-access"
import StartMenu from "./start-menu/start-menu"
import OverflowRow from "./taskbar/overflow-row"
import SignOut from "./taskbar/sign-out"
import SystemDialogs from "./taskbar/system-dialogs"
import Taskbar from "./taskbar/taskbar"
import WindowTaskbarItem from "./taskbar/window-taskbar-item"
import ProcessWindow from "./window-manager/process-window"
import useWindows from "./window-manager/window-manager"
import useProperty from "@libs/the-link/plugins/react-helper/property-hook"
import { ReadyWallpaper, WallpaperBackground } from "../components/wallpaper"
import ProgramFrame from "./program-frame"
import Loading from "../components/loading"
import { useRequirement } from "@libs/readiness/main"

export default function Workspace() {

    const application = ApplicationContext.useValue()

    const authManager = AuthManagerContext.useValue()

    const desktopWallpaper = useProperty(authManager.linkManager.desktopWallpaper)

    const windows = useWindows()

    const completePrograms = useRequirement("programs")

    const initialPrograms = useRef<ReadonlySet<string> | null>(null)

    initialPrograms.current ??= new Set(windows.records.map(record => record.identity))

    const [readyPrograms, setReadyPrograms] = useState<ReadonlySet<string>>(() => new Set())

    const wallpaperIdentity = windows.wallpaper?.identity ?? null

    const [readyWallpaper, setReadyWallpaper] = useState<string | null>(null)

    const [fileWallpaperReady, setFileWallpaperReady] = useState(false)

    const programWallpaperReady = wallpaperIdentity !== null && readyWallpaper === wallpaperIdentity

    const wallpaperReady = windows.wallpaper ? programWallpaperReady : fileWallpaperReady

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

    const { windowSurfaceRef, windowSurfaceSize, frame, frameLoaded } = useClientHost(desktop, sources.current, windows.localWindow)

    const wallpaperLoaded = useCallback((event: SyntheticEvent<HTMLIFrameElement>) => {

        const wallpaper = windows.wallpaper

        if (wallpaper) {

            frameLoaded(wallpaper.identity, event.currentTarget)

            setReadyWallpaper(wallpaper.identity)
        }

    }, [frameLoaded, windows.wallpaper])

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

        className="z-4 overflow-hidden"

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

    const wallpaper = <>

        <WallpaperBackground

            file={windows.wallpaper ? undefined : desktopWallpaper}

            visible={!programWallpaperReady}

            onReady={fileWallpaperLoaded}

        />

        {windows.wallpaper?.client && programAccess !== "checking" && <ProgramFrame

            record={windows.wallpaper}

            client={windows.wallpaper.client}

            title={windows.wallpaper.client.window.title}

            door={application.doors.program}

            access={programAccess}

            className={`absolute inset-0 size-full border-0 ${programWallpaperReady ? "" : "pointer-events-none opacity-0"}`}

            onFrame={frame}

            onLoad={wallpaperLoaded}

        />}

    </>

    return <div ref={desktop} tabIndex={-1} aria-label="Desktop" onFocusCapture={focus.remember} className="relative isolate grid min-h-0 grid-cols-1 grid-rows-1 outline-none">

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
