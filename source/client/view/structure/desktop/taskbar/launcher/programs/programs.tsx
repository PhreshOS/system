import LauncherItem from "./launcher-item"
import programIcon from "../../../programs/program-icon"
import usePrograms from "../../../programs/programs"
import { ApplicationContext } from "@client/view/contexts"
import Program from "@client/core/link-manager/auth-manager/program-manager/program"
import usePromise from "@libs/react-promise"
import Alert from "@client/view/components/alert"
import { matchesProgram } from "../search"

interface ProgramsProps {

    onChoose: () => void

    terms: readonly string[]
}

/** The installed-program section of the Start Menu. */
export default function Programs({ onChoose, terms }: ProgramsProps) {

    const application = ApplicationContext.useValue()

    const programs = usePrograms().filter(program => matchesProgram(program, terms))

    return <div role="group" aria-label="Programs" className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">

        <h3 className="px-3 py-2 text-xs font-medium opacity-60">Programs · {programs.length}</h3>

        {programs.length

            ? <div className="grid min-h-0 content-start gap-1 overflow-y-auto">{programs.map(record => <ProgramItem

                key={record.identity}

                icon={programIcon(application.doors.program, record.assetId)}

                record={record}

                onChoose={onChoose}

            />)}</div>

            : <p className="m-0 grid min-h-32 place-items-center px-3 py-8 text-center text-sm opacity-50">{terms.length ? "No matching Programs" : "No installed programs"}</p>}

    </div>
}

function ProgramItem({ icon, record, onChoose }: { icon: string, record: Program, onChoose: () => void }) {

    const launch = usePromise(async function () {

        onChoose()

        await record.createProcess()
    })

    return <>

        <LauncherItem

            label={record.name}

            icon={icon}

            description={record.description}

            disabled={launch.isPending}

            onClick={() => launch.safeExecute()}

        >

            {record.name}

        </LauncherItem>

        {launch.exception && <Alert className="text-sm">{String(launch.exception.current)}</Alert>}

    </>
}
