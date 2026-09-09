import { Button } from "@phreshos/react-ui"
import type Process from "@client/core/link-manager/auth-manager/process-manager/process"
import usePromise from "@libs/react-promise"
import type Program from "@client/core/link-manager/auth-manager/program-manager/program"
import { ApplicationContext } from "@client/view/contexts"
import programIcon from "../../../programs/program-icon"

/** The exit action requests authority; the live list owns removal. */
export default function ProcessItem({ process, program }: Readonly<{ process: Process, program: Program | undefined }>) {

    const application = ApplicationContext.useValue()

    const ending = usePromise(() => process.exit())

    const status = [
        process.server ? process.server.ready ? "Server ready" : "Server starting" : null,
        process.client ? "Client running" : null
    ].filter(Boolean).join(" · ") || "No active endpoints"

    return <li className="grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 border-b border-current/10 px-3 py-1.5 last:border-b-0">

        {program ? <img src={programIcon(application.doors.program, program.assetId)} alt="" draggable={false} className="size-6 object-contain" /> : <span aria-hidden="true" />}

        <div className="min-w-0">

            <p className="m-0 truncate text-sm font-medium" title={`${program?.name ?? process.program} · ${process.identity}`}>
                {program?.name ?? process.program} <span className="text-xs font-normal opacity-60">· {process.name ?? process.identity}</span>
            </p>

            <p className="m-0 truncate text-xs opacity-50" title={status}>{status}</p>

        </div>

        <Button
            size="xsmall"
            color="danger"
            pending={ending.isPending}
            aria-label={`End process ${process.name ?? process.identity}`}
            onPress={() => void ending.safeExecute()}
        >{ending.isPending ? "Ending…" : "End"}</Button>

        {ending.exception && <p role="alert" className="col-span-3 m-0 text-xs">
            {ending.exception.current instanceof Error ? ending.exception.current.message : "Could not end this Process."}
        </p>}

    </li>
}
