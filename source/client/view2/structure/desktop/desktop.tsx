import Wallpaper from "./wallpaper/wallpaper"
import UnderWindows from "./under-windows/under-windows"
import Windows from "./windows/windows"
import OverWindows from "./over-windows/over-windows"
import Taskbar from "./taskbar/taskbar"
import { AuthManagerContext } from "@client/view2/contexts"
import { DesktopContext } from "./context"
import useClientHost from "@client/view/components/desktop-host/client-host"
import useWindows from "@client/view/components/window-manager/window-manager"
import { useRef } from "react"

export default function () {

    const authManager = AuthManagerContext.useValue()

    const desktop = useRef<HTMLDivElement>(null)

    const sources = useRef(new Map<string, HTMLIFrameElement | null>())

    const windows = useWindows(authManager)

    const host = useClientHost(authManager, desktop, sources.current, windows.localWindow)

    return <DesktopContext.Provider value={{ host, windows }}>

        <div ref={desktop} className="relative isolate grid min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] gap-2.5 p-2.5">

            <Wallpaper />

            <UnderWindows />

            <Windows />

            <OverWindows />

            <Taskbar />

        </div>

    </DesktopContext.Provider>
}
