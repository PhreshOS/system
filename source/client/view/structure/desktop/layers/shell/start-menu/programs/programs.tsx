import LauncherItem from "./launcher-item"
import programIcon from "@client/view/structure/desktop/programs/program-icon"
import usePrograms from "@client/view/structure/desktop/programs/programs"
import { ApplicationContext } from "@client/view/contexts"
import Program from "@client/core/link-manager/auth-manager/program-manager/program"
import usePromise from "@libs/react-promise"
import Alert from "@client/view/components/alert"
import { matchesProgram } from "../search"
import { useLaunchPlacement } from "@client/view/structure/desktop/launch-placement"
import Section from "../section"
import { categorized, CategoryHeading } from "./categories"
import { Fragment, useRef } from "react"

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

    // Read when the launch happens, not when this item first rendered: the view may have moved since.
    const currentPlacement = useLaunchPlacement()

    const placement = useRef(currentPlacement)

    placement.current = currentPlacement

    // A Program that declares where its Window goes keeps it; otherwise the Window opens where this Desktop looks.
    const launch = usePromise(async function () {

        onChoose()

        const declared = record.client?.position ?? null

        const size = record.client?.size ?? null

        // A Window that opens where its Program declares is brought into view.
        if (declared) placement.current.reveal(declared, size)

        await record.createProcess(declared ? {} : { client: { position: placement.current.place(size) } })
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
