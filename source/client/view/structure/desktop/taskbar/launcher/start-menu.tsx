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

        surfaceClassName="border-light-foreground"

        className="inset-auto inset-be-[calc(anchor(top)+var(--desktop-gutter))] inset-s-[anchor(start)] max-h-[min(32rem,calc(100vh-var(--spacing-taskbar)-var(--desktop-gutter)*3))] w-[min(22rem,calc(100vw-var(--desktop-gutter)*2))] [position-anchor:--desktop-taskbar]"

    >

        {close => <div data-start-menu-scroll className="grid min-h-0 max-h-full overflow-y-auto p-2 scrollbar-gutter-stable">

            <ProgramsSection onChoose={close} />

        </div>}

    </Launcher>
})
