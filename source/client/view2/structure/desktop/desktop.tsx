import Wallpaper from "./wallpaper/wallpaper"
import UnderWindows from "./under-windows/under-windows"
import Windows from "./windows/windows"
import OverWindows from "./over-windows/over-windows"
import Taskbar from "./taskbar/taskbar"

export default function () {

    return <div className="relative isolate grid min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] gap-2.5 p-2.5">

        <Wallpaper />

        <UnderWindows />

        <Windows />

        <OverWindows />

        <Taskbar />

    </div>
}
