import logo from "@/assets/bundled/logo.png"
import { memo } from "react"
import Launcher from "./launcher"
import Programs from "./programs/programs"
import Processes from "./processes/processes"
import StartMenuPanel from "./start-menu-panel"
import { ApplicationContext } from "@client/view/contexts"

/** The taskbar entry point for current and future desktop actions. */
export default memo(function StartMenu() {

    const application = ApplicationContext.useValue()

    return <Launcher

        label="PhreshOS"

        trigger={<>

            <img src={logo} alt="" className="size-5 shrink-0" />

            <span className="hidden text-xs font-semibold sm:inline">PhreshOS</span>

        </>}

        className="inset-auto inset-be-[calc(anchor(top)+var(--desktop-gutter))] inset-s-[anchor(start)] max-h-[min(32rem,calc(100vh-var(--spacing-taskbar)-var(--desktop-gutter)*3))] w-[min(44rem,calc(100vw-var(--desktop-gutter)*2))] [position-anchor:--desktop-taskbar]"

    >

        {(close, labelId) => <StartMenuPanel
            labelId={labelId}
            version={application.version}
            left={<Programs onChoose={close} />}
            right={<Processes />}
        />}

    </Launcher>
})
