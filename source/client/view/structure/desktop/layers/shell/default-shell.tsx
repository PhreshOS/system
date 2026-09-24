import { type AppearanceTaskbar } from "@phreshos/core"
import { type ReactNode } from "react"
import SystemDialogs from "./dialogs/system-dialogs"
import StartMenu, { StartMenuButton, StartMenuProvider, useStartMenuOpen } from "./start-menu/start-menu"
import SignOut from "./taskbar/sign-out"
import Taskbar from "./taskbar/taskbar"

/** Built-in Shell entities composed as siblings in the complete Shell layer. */
export default function DefaultShell({ spacing, taskbar, children }: Readonly<{
    spacing: number
    taskbar: AppearanceTaskbar
    children: ReactNode
}>) {

    const horizontal = taskbar.position === "top" || taskbar.position === "bottom"

    return <>

        <StartMenuProvider spacing={spacing} taskbar={taskbar}>

            <DefaultTaskbar spacing={spacing} taskbar={taskbar} horizontal={horizontal}>
                {children}
            </DefaultTaskbar>

            <StartMenu />

        </StartMenuProvider>

        <SystemDialogs />

    </>
}

function DefaultTaskbar({ spacing, taskbar, horizontal, children }: Readonly<{
    spacing: number
    taskbar: AppearanceTaskbar
    horizontal: boolean
    children: ReactNode
}>) {
    const startMenuOpen = useStartMenuOpen()

    return <Taskbar
        leading={<StartMenuButton showLabel={horizontal} />}
        trailing={<SignOut showLabel={horizontal} />}
        spacing={spacing}
        taskbar={taskbar}
        keepVisible={startMenuOpen}
    >
        {children}
    </Taskbar>
}
