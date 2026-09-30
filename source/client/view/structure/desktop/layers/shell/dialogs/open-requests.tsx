import type { OpenRequestSnapshot } from "@phreshos/core"
import { ReactTunnel } from "@the-link/react"
import { surfaceLifecyclePose, surfacePresenceTransition } from "@client/view/appearance/surface-presence"
import { useReducedMotion } from "@libs/react-motion"
import { motion } from "motion/react"
import { useEffect, useId, useRef, useState } from "react"
import { ApplicationContext, AuthManagerContext } from "@client/view/contexts"
import ShellSurface, { shellSurfaceClassName } from "../shell-surface"
import usePromise from "@libs/react-promise"
import Alert from "@client/view/components/alert"
import usePrograms from "@client/view/structure/desktop/programs/programs"
import programIcon from "@client/view/structure/desktop/programs/program-icon"
import { Button, Checkbox, Text, useAppearance, useScale } from "@phreshos/react-ui"

/** The default Shell's choice of a Program for something that has no default one. */
export default function OpenRequests() {

    const manager = AuthManagerContext.useValue().openingManager
    const inbound = ReactTunnel.useFactory(manager.$inbound)
    const requests = inbound.useFirstState("/requests", manager.list())
    const request = requests[0]
    const surface = useRef<HTMLDialogElement>(null)
    const title = useId()
    const reducedMotion = useReducedMotion()
    const transaction = useAppearance().transaction

    useEffect(() => {

        const element = surface.current

        if (!request || !element || element.open) return

        element.showModal()

        return () => { if (element.open) element.close() }
    }, [request?.identity])

    if (!request) return null

    return <motion.dialog
        ref={surface}
        aria-modal="true"
        aria-labelledby={title}
        initial={reducedMotion ? surfaceLifecyclePose.visible : surfaceLifecyclePose.hidden}
        animate={surfaceLifecyclePose.visible}
        transition={surfacePresenceTransition(reducedMotion, transaction)}
        onCancel={event => { event.preventDefault(); void manager.cancel(request.identity).catch(() => undefined) }}
        className={`${shellSurfaceClassName} pointer-events-auto fixed inset-0 m-auto h-fit w-[min(24rem,calc(100vw-var(--desktop-gutter)*2))] backdrop:bg-transparent`}
    >
        <ShellSurface material="full" label="Open with" labelId={title}>
            <OpenRequestView key={request.identity} request={request} />
        </ShellSurface>
    </motion.dialog>
}

function OpenRequestView({ request }: Readonly<{ request: OpenRequestSnapshot }>) {

    const manager = AuthManagerContext.useValue().openingManager
    const application = ApplicationContext.useValue()
    const space = useScale(useAppearance().spacing)
    const installed = usePrograms()
    const [always, setAlways] = useState(false)
    const decision = usePromise((program: string | null) => program === null
        ? manager.cancel(request.identity)
        : manager.choose(request.identity, program, { always }))
    const programs = request.programs.map(offered => installed.find(program => program.identity === offered.identity)).filter(program => program !== undefined)

    return <div className="grid" style={{ gap: space.medium }}>

        <div className="grid" style={{ gap: space.xsmall }}>
            <span className="truncate" title={request.target.uri}><Text style={{ fontWeight: 500 }}>{describe(request.target.uri)}</Text></span>
            <Text tone="secondary" size="small">{request.from ? `${request.from.process.program.name} asks to open it` : "Opened from outside the Desktop"} · {request.target.type}</Text>
        </div>

        <div className="grid" style={{ gap: space.xsmall }}>
            {programs.map(program => <Button key={program.identity} disabled={decision.isPending} onPress={() => decision.safeExecute(program.identity)}
                style={{ justifyContent: "flex-start" }}>
                <img src={programIcon(application.doors.program, program.assetId)} alt="" draggable={false} className="shrink-0 object-contain" style={{ width: space.large, height: space.large }} />
                {program.name}
            </Button>)}
        </div>

        <Checkbox size="small" checked={always} onChange={setAlways} label={`Always open ${request.target.type} with it`} />

        <div className="flex justify-end">
            <Button size="small" autoFocus disabled={decision.isPending} onPress={() => decision.safeExecute(null)}>Cancel</Button>
        </div>

        {decision.exception && <Alert className="text-sm">{String(decision.exception.current)}</Alert>}
    </div>
}

/** A short name for what is being opened: a file's name, or the address itself. */
function describe(uri: string) {

    try {
        const url = new URL(uri)
        if (url.protocol === "file:") return decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? url.pathname)
        return uri
    }
    catch { return uri }
}
