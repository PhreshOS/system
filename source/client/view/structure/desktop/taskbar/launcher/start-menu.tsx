import logo from "@/assets/bundled/logo.png"
import { memo, useState } from "react"
import Launcher from "./launcher"
import Programs from "./programs/programs"
import Processes from "./processes/processes"
import StartMenuPanel from "./start-menu-panel"
import { ApplicationContext } from "@client/view/contexts"
import SearchBar from "./search-bar"
import { searchTerms } from "./search"

/** The taskbar entry point for current and future desktop actions. */
export default memo(function StartMenu() {

    const application = ApplicationContext.useValue()

    const [query, setQuery] = useState("")

    const terms = searchTerms(query)

    return <Launcher

        label={application.displayName}

        trigger={<>

            <img src={logo} alt="" className="size-5 shrink-0" />

            <span className="hidden text-xs font-semibold sm:inline">{application.displayName}</span>

        </>}

        className="inset-auto inset-be-[calc(anchor(top)+var(--desktop-gutter))] inset-s-[anchor(start)] h-[min(32rem,calc(100vh-var(--spacing-taskbar)-var(--desktop-gutter)*3))] w-[min(44rem,calc(100vw-var(--desktop-gutter)*2))] [position-anchor:--desktop-taskbar]"

    >

        {(close, labelId) => <StartMenuPanel
            labelId={labelId}
            name={application.displayName}
            version={application.version}
            left={<Programs onChoose={close} terms={terms} />}
            right={<Processes terms={terms} />}
            footer={<SearchBar query={query} onChange={setQuery} />}
        />}

    </Launcher>
})
