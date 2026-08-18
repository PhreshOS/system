import LauncherItem from "../taskbar/launcher-item"
import programIcon from "../programs/program-icon"
import usePrograms from "../programs/programs"
import { ApplicationContext } from "../../contexts"

interface ProgramsSectionProps {

    onChoose: () => void
}

/** The installed-program section of the Start Menu. */
export default function ProgramsSection({ onChoose }: ProgramsSectionProps) {

    const application = ApplicationContext.useValue()

    const programs = usePrograms()

    return <section aria-label="Programs" className="grid gap-1">

        {programs.length

            ? programs.map(record => <LauncherItem

                key={record.identity}

                label={record.name}

                icon={programIcon(application.doors.program, record.assetId)}

                description={record.description}

                onClick={() => {

                    onChoose()

                    record.createProcess().catch(console.error)
                }}

            >

                {record.name}

            </LauncherItem>)

            : <p className="px-3 py-8 text-center text-sm text-slate-600">No installed programs</p>}

    </section>
}
