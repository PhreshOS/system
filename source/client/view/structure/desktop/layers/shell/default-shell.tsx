import { type AppearanceTaskbar } from "@phreshos/core"
import { useState, type ReactNode } from "react"
import SystemErrors from "./dialogs/system-errors"
import PermissionRequests from "./dialogs/permission-requests"
import StartMenu, { StartMenuButton, StartMenuProvider, useStartMenuOpen } from "./start-menu/start-menu"
import SignOut from "./taskbar/sign-out"
import Taskbar from "./taskbar/taskbar"
import ViewportControl, { type MappedWindow } from "./taskbar/viewport/viewport-control"
import { type ViewportControl as Viewport } from "../../viewport-offset"

/** Built-in Shell entities composed as siblings in the complete Shell layer. */
export default function DefaultShell({ spacing, taskbar, viewport, mappedWindows, children }: Readonly<{
    spacing: number
    taskbar: AppearanceTaskbar
    viewport: Viewport
    mappedWindows: readonly MappedWindow[]
    children: ReactNode
}>) {

    const horizontal = taskbar.position === "top" || taskbar.position === "bottom"

    return <>

        <StartMenuProvider spacing={spacing} taskbar={taskbar}>

            <DefaultTaskbar spacing={spacing} taskbar={taskbar} viewport={viewport} mappedWindows={mappedWindows} horizontal={horizontal}>
                {children}
            </DefaultTaskbar>

            <StartMenu />

        </StartMenuProvider>

        <SystemErrors />

        <PermissionRequests />

    </>
}

function DefaultTaskbar({ spacing, taskbar, viewport, mappedWindows, horizontal, children }: Readonly<{
    spacing: number
    taskbar: AppearanceTaskbar
    viewport: Viewport
    mappedWindows: readonly MappedWindow[]
    horizontal: boolean
    children: ReactNode
}>) {
    const startMenuOpen = useStartMenuOpen()

    const [mapOpen, setMapOpen] = useState(false)

    return <Taskbar
        leading={<StartMenuButton showLabel={horizontal} />}
        navigation={<ViewportControl viewport={viewport} windows={mappedWindows} taskbar={taskbar} spacing={spacing} onOpenChange={setMapOpen} />}
        trailing={<SignOut showLabel={horizontal} />}
        spacing={spacing}
        taskbar={taskbar}
        keepVisible={startMenuOpen || mapOpen}
    >
        {children}
    </Taskbar>
}
