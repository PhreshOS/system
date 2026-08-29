import logo from "@/assets/bundled/logo.png"
import { memo } from "react"
import Launcher from "./launcher"
import ProgramsSection from "./programs-section"

/** The taskbar entry point for current and future desktop actions. */
export default memo(function StartMenu() {

    return <Launcher

        label="Start Menu"

        trigger={<>

            <img src={logo} alt="" className="size-5 shrink-0" />

            <span className="hidden text-xs font-semibold sm:inline">Start Menu</span>

        </>}

        className="inset-auto inset-be-[calc(anchor(top)+var(--desktop-gutter))] inset-s-[anchor(start)] max-h-[min(32rem,calc(100vh-var(--spacing-taskbar)-var(--desktop-gutter)*3))] w-[min(22rem,calc(100vw-var(--desktop-gutter)*2))] [position-anchor:--desktop-taskbar]"

    >

        {close => <ProgramsSection onChoose={close} />}

    </Launcher>
})
