import LauncherItem from "./launcher-item"
import programIcon from "@client/view/structure/desktop/programs/program-icon"
import usePrograms from "@client/view/structure/desktop/programs/programs"
import { ApplicationContext } from "@client/view/contexts"
import Program from "@client/core/link-manager/auth-manager/program-manager/program"
import usePromise from "@libs/react-promise"
import Alert from "@client/view/components/alert"
import { matchesProgram } from "../search"
import Section from "../section"
import { categorized, CategoryHeading } from "./categories"
import { Fragment } from "react"

interface ProgramsProps {

    onChoose: () => void

    terms: readonly string[]
}

/** The installed-program section of the Start Menu, grouped by category. */
export default function Programs({ onChoose, terms }: ProgramsProps) {

    const application = ApplicationContext.useValue()

    const programs = usePrograms().filter(program => matchesProgram(program, terms))

    return <Section label="Programs" columns={3} count={programs.length} empty={terms.length ? "No matching Programs" : "No installed programs"}>

        {categorized(programs).map(({ category, members }) => <Fragment key={category}>

            <CategoryHeading category={category} />

            {members.map(record => <ProgramItem

                key={record.identity}

                icon={programIcon(application.doors.program, record.assetId)}

                record={record}

                onChoose={onChoose}

            />)}

        </Fragment>)}

    </Section>
}

function ProgramItem({ icon, record, onChoose }: { icon: string, record: Program, onChoose: () => void }) {

    const launch = usePromise(async function () {

        onChoose()

        await record.open()
    })

    return <>

        <LauncherItem

            icon={icon}

            description={record.description}

            pending={launch.isPending}

            onPress={() => void launch.safeExecute()}

        >

            {record.name}

        </LauncherItem>

        {launch.exception && <Alert className="text-sm">{String(launch.exception.current)}</Alert>}

    </>
}
