import Wallpaper from "./wallpaper/wallpaper"
import UnderWindows from "./under-windows/under-windows"
import Windows from "./windows/windows"
import OverWindows from "./over-windows/over-windows"
import Taskbar from "./taskbar/taskbar"

export default function () {

    return <div className="grid grid-rows-5 p-3">

        <Wallpaper />

        <UnderWindows />

        <Windows />

        <OverWindows />

        <Taskbar />

    </div>
}
