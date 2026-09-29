import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react"
import { AppLayout, Button, Drawer, Panel, SearchField, SegmentedControl, Text, Tree, useAppearance, useColor, useScale } from "@phreshos/react-ui"
import { Activity, LayoutGrid, List, PanelLeft, Settings as SettingsIcon } from "@phreshos/react-ui/icons"
import logo from "@/assets/bundled/logo.png"
import { floatingShadow } from "@client/view/appearance/floating-shadow"
import usePrograms from "@client/view/structure/desktop/programs/programs"
import Programs, { useLaunch, type ProgramsLayout } from "./programs/programs"
import Processes from "./processes/processes"
import { categories, categoryIcon, categoryOf } from "./programs/categories"
import { matchesProcess, matchesProgram, searchTerms } from "./search"
import useLive from "./live"
import type Program from "@client/core/link-manager/auth-manager/program-manager/program"

type Show = "programs" | "processes"

/** Every category at once. Not "all", which a collection reads as every item chosen. */
const all = "every-category"

/**
 * The built-in Start Menu content, laid out as a Program is: the System's name above a sidebar that
 * chooses between the Programs and the Processes and among the Programs' categories; beside it, the
 * search and the way the Programs are shown, the list recessed below them, and a status line under it.
 */
export default function StartMenuPanel({ labelId, name, version, onChoose }: Readonly<{
    labelId: string
    name: string
    version: string
    /** Called when a Program is chosen, before it opens. */
    onChoose: () => void
}>) {

    const space = useScale(useAppearance().spacing)

    const danger = useColor("danger").base

    const [show, setShow] = useState<Show>("programs")

    const [category, setCategory] = useState(all)

    const [layout, setLayout] = useState<ProgramsLayout>("grid")

    const [query, setQuery] = useState("")

    const [problem, setProblem] = useState<string | null>(null)

    const frame = useRef<HTMLDivElement>(null)

    const narrow = useNarrow(frame)

    const [drawer, setDrawer] = useState(false)

    const launch = useLaunch()

    const installed = usePrograms()

    const live = useLive()

    const terms = searchTerms(query)

    const inCategory = category === all ? installed : installed.filter(program => categoryOf(program) === category)

    const programs = inCategory.filter(program => matchesProgram(program, terms))

    const processes = live.processes.filter(process => matchesProcess(process.name, live.programs.get(process.program), terms))

    const running = new Map<string, number>()

    for (const process of live.processes) running.set(process.program, (running.get(process.program) ?? 0) + 1)

    const starting = processes.filter(process => process.server && !process.server.ready).length

    const status = problem ?? (show === "programs"
        ? [programs.length === installed.length ? count(installed.length, "Program") : `${programs.length} of ${count(installed.length, "Program")}`,
            programs.some(program => running.has(program.identity)) ? `${programs.filter(program => running.has(program.identity)).length} running` : null]
        : [count(processes.length, "Process"), starting ? `${starting} starting` : null]).filter(Boolean).join(" · ")

    function choose(next: Show, nextCategory = category) {

        setShow(next)

        setCategory(nextCategory)

        setProblem(null)

        setDrawer(false)
    }

    const identity = <>

        <img src={logo} alt="" draggable={false} className="shrink-0 rounded-sm object-contain" style={{ width: space.xlarge, height: space.xlarge }} />

        {/* The version sits on the name's baseline, below its middle. */}
        <span className="flex min-w-0 items-baseline" style={{ gap: space.small }}>

            <span className="truncate">{name}</span>

            {/* The same size as the status line, not a share of the name's. */}
            <Text tone="secondary" className="shrink-0 tabular-nums" aria-label={`System version ${version}`} style={{ fontSize: "0.75rem", fontWeight: 400 }}>v{version}</Text>

        </span>

    </>

    const navigation = <>

        <Heading first>Show</Heading>

        <Tree aria-label="Show" selectionMode="single" value={show} onChange={value => { if (value) choose(value as Show) }}>
            <Place id="programs" icon={<LayoutGrid />} label="Programs" count={installed.length} />
            <Place id="processes" icon={<Activity />} label="Processes" count={live.processes.length} />
        </Tree>

        <Heading>Categories</Heading>

        {/* A category shows the Programs in it, so it is chosen only while the Programs are shown. */}
        <Tree aria-label="Categories" selectionMode="single" value={show === "programs" ? category : null} onChange={value => { if (value) choose("programs", value) }}>
            <Place id={all} icon={<LayoutGrid />} label="All" count={installed.length} />
            {categories(installed).map(({ category, count }) => {
                const Icon = categoryIcon(category)
                return <Place key={category} id={category} icon={<Icon />} label={category} count={count} />
            })}
        </Tree>

    </>

    function open(program: Program) {

        onChoose()

        launch(program).catch(error => setProblem(error instanceof Error ? error.message : `${program.name} could not open.`))
    }

    // The System's settings, at the foot of the sidebar as in Files, while the Settings Program is installed.
    const settings = installed.find(program => program.identity === "settings")

    const settingsEntry = settings ? <Button depth="none" size="small" onPress={() => open(settings)}><SettingsIcon />{settings.name}</Button> : null

        // As in Files, a narrow menu gives the sidebar up to the Programs and keeps it one press away, in a drawer.
    return <Panel ref={frame} shadow={floatingShadow} style={{ position: "relative", height: "100%", maxHeight: "inherit" }}>

        {/* The Appearance spacing all around the frame. */}
        <AppLayout sidebarWidth={narrow ? 0 : undefined} style={{ padding: space.medium, paddingTop: space.small, ...(narrow ? { columnGap: 0 } : {}) }}>

            {!narrow && <AppLayout.Title id={labelId} style={{ gap: space.small, paddingInline: space.small, fontSize: "1.25rem" }}>{identity}</AppLayout.Title>}

            {!narrow && <AppLayout.Sidebar aria-label="Start" footer={settingsEntry}>{navigation}</AppLayout.Sidebar>}

            <AppLayout.Header style={{ paddingInline: space.small, marginBottom: space.small }}>

                {narrow && <>
                    <span id={labelId} className="sr-only">{name}</span>
                    <Button iconOnly depth="flat" size="small" aria-label="Show and categories" aria-expanded={drawer} onPress={() => setDrawer(!drawer)}><PanelLeft /></Button>
                </>}

                <Text size="xlarge" className="min-w-0 flex-1 truncate" style={{ fontWeight: 600 }}>{show === "processes" ? "Processes" : category === all ? "All Programs" : category}</Text>

                <SearchField aria-label={show === "programs" ? "Search Programs" : "Search Processes"} placeholder="Search" size="small" value={query} onChange={setQuery} style={{ width: space.xlarge * 8 }} />

                {show === "programs" && <SegmentedControl aria-label="View" size="small" value={layout} onChange={value => setLayout(value as ProgramsLayout)}>
                    <SegmentedControl.Item id="list" aria-label="List"><List /></SegmentedControl.Item>
                    <SegmentedControl.Item id="grid" aria-label="Icons"><LayoutGrid /></SegmentedControl.Item>
                </SegmentedControl>}

            </AppLayout.Header>

            {/* A size container, so a quiet line can stand in its middle. */}
            <AppLayout.Content style={{ containerType: "size" }}>

                {show === "programs"
                    ? <Programs programs={programs} layout={layout} running={running}
                        empty={terms.length ? "No matching Programs" : category === all ? "No installed Programs" : `No Programs in ${category}`}
                        onLaunch={open} />
                    : <Processes processes={processes} programs={live.programs} empty={terms.length ? "No matching Processes" : "No Processes"} />}

            </AppLayout.Content>

            <AppLayout.Footer style={{ paddingInline: space.small, paddingTop: space.medium }}>

                <span role="status" className="min-w-0 truncate"><Text tone={problem ? undefined : "secondary"} size="small" className="tabular-nums" style={problem ? { color: danger } : undefined}>{status}</Text></span>

            </AppLayout.Footer>

        </AppLayout>

        {narrow && <Drawer open={drawer} onClose={() => setDrawer(false)} aria-label="Start"
            title={<span className="flex min-w-0 items-center" style={{ gap: space.small }}>{identity}</span>} style={{ display: "flex", flexDirection: "column" }}>
            {navigation}{settingsEntry && <div style={{ marginTop: "auto" }}>{settingsEntry}</div>}
        </Drawer>}

    </Panel>
}

/** One choice in the sidebar: its icon, its name, and how many it holds. */
function Place({ id, icon, label, count }: Readonly<{ id: string, icon: ReactNode, label: string, count: number }>) {

    return <Tree.Item id={id} textValue={label}>
        <Tree.Content>{icon}<span className="min-w-0 flex-1 truncate">{label}</span><Text tone="secondary" size="small" className="tabular-nums">{count}</Text></Tree.Content>
    </Tree.Item>
}

/** A group's name in the sidebar. */
function Heading({ first = false, children }: Readonly<{ first?: boolean, children: ReactNode }>) {

    const space = useScale(useAppearance().spacing)

    return <Text tone="secondary" size="xsmall" className="block" style={{ paddingInline: space.small, marginTop: first ? space.xsmall : space.large, marginBottom: space.xsmall }}>{children}</Text>
}

function count(amount: number, noun: string) {

    return `${amount} ${noun}${amount === 1 ? "" : noun.endsWith("s") ? "es" : "s"}`
}

/** Narrow enough that the sidebar would crowd the Programs out: the width at which Files gives up its places. */
function useNarrow(frame: RefObject<HTMLElement | null>) {

    const [narrow, setNarrow] = useState(false)

    useLayoutEffect(function () {

        const element = frame.current

        if (!element) return

        const observer = new ResizeObserver(([entry]) => setNarrow((entry?.contentRect.width ?? Infinity) <= 640))

        observer.observe(element)

        return () => observer.disconnect()

    }, [frame])

    return narrow
}
