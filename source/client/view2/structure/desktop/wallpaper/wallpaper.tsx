import { ApplicationContext, AuthManagerContext } from "@client/view2/contexts"
import { DesktopContext } from "../context"
import Background from "./background/background"
import useProperty from "@libs/the-link/plugins/react-helper/property-hook"
import ProgramAccessProbe, { type ProgramAccess } from "@client/view/components/program-access"
import ProgramFrame from "@client/view/components/program-frame"
import { type SyntheticEvent, useCallback, useState } from "react"

export default function () {

    const authManager = AuthManagerContext.useValue()

    const application = ApplicationContext.useValue()

    const { host, windows } = DesktopContext.useValue()

    const wallpaper = useProperty(authManager.linkManager.desktopWallpaper)

    const program = windows.wallpaper

    const [access, setAccess] = useState<ProgramAccess>("checking")

    const [ready, setReady] = useState<string | null>(null)

    const programReady = program !== null && ready === program.identity

    const loaded = useCallback(function (event: SyntheticEvent<HTMLIFrameElement>) {

        if (!program) return

        host.frameLoaded(program.identity, event.currentTarget)

        setReady(program.identity)

    }, [host, program])

    return <div className="absolute inset-0 z-0 overflow-hidden">

        <ProgramAccessProbe door={application.doors.program} setAccess={setAccess} />

        <Background file={program ? undefined : wallpaper} visible={!programReady} />

        {program?.client && access !== "checking" && <ProgramFrame

            record={program}

            client={program.client}

            title={program.client.window.title}

            door={application.doors.program}

            access={access}

            className={`absolute inset-0 size-full border-0 ${programReady ? "" : "pointer-events-none opacity-0"}`}

            onFrame={host.frame}

            onLoad={loaded}

        />}

    </div>
}
