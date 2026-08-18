import logo from "@/assets/bundled/logo.png"
import { memo } from "react"
import { startMenuStyle } from "../geometry"
import Launcher from "../taskbar/launcher"
import ProgramsSection from "./programs-section"

/** The taskbar entry point for current and future desktop actions. */
export default memo(function StartMenu() {

    return <Launcher

        label="Start Menu"

        trigger={<>

            <img src={logo} alt="" className="size-5 shrink-0" />

            <span className="hidden text-xs font-semibold sm:inline">Start Menu</span>

        </>}

        style={startMenuStyle}

    >

        {close => <div className="grid max-h-full overflow-y-auto p-2">

            <ProgramsSection onChoose={close} />

        </div>}

    </Launcher>
})
