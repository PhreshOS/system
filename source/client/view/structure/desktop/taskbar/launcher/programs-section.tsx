import LauncherItem from "./launcher-item"
import programIcon from "../../programs/program-icon"
import usePrograms from "../../programs/programs"
import { ApplicationContext } from "../../../../contexts"
import Program from "@client/core/link-manager/auth-manager/program-manager/program"
import usePromise from "@libs/react-promise"
import Alert from "../../../../components/alert"

interface ProgramsSectionProps {

    onChoose: () => void
}

/** The installed-program section of the Start Menu. */
export default function ProgramsSection({ onChoose }: ProgramsSectionProps) {

    const application = ApplicationContext.useValue()

    const programs = usePrograms()

    return <div role="group" aria-label="Programs" className="grid gap-1">

        {programs.length

            ? programs.map(record => <ProgramItem

                key={record.identity}

                icon={programIcon(application.doors.program, record.assetId)}

                record={record}

                onChoose={onChoose}

            />)

            : <p className="px-3 py-8 text-center text-sm opacity-60">No installed programs</p>}

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
