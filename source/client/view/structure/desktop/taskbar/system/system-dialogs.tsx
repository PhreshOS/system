import { type PermissionChoice, type PermissionDialog, type ServerCrashDialog } from "@server/core/dialog-manager"
import { ReactTunnel } from "@the-link/react"
import { enterSurface, prepareSurfaceEntrance, restSurface } from "@client/view/appearance/surface-presence"
import { useReducedMotion } from "@libs/react-motion"
import { useAppearance, useResolveTheme, useScale } from "@phreshos/react-ui"
import { useEffect, useId, useRef } from "react"
import { AuthManagerContext } from "@client/view/contexts"
import TaskbarSurface, { taskbarSurfaceClassName } from "../taskbar-surface"
import TaskbarButton from "../taskbar-button"
import usePromise from "@libs/react-promise"
import Alert from "@client/view/components/alert"

/** Taskbar-owned presentation of the system's authoritative dialog queue. */
export default function SystemDialogs() {

    const authManager = AuthManagerContext.useValue()

    const dialogManager = authManager.dialogManager

    const inbound = ReactTunnel.useFactory(dialogManager.$inbound)

    const dialogs = inbound.useFirstState("/dialogs", dialogManager.list())

    const dialog = dialogs[0]

    const dialogIdentity = dialog?.identity

    const surface = useRef<HTMLDialogElement>(null)

    const title = useId()

    const description = useId()

    const reducedMotion = useReducedMotion()

    const radius = useScale(useResolveTheme(useAppearance().radius)).large

    useEffect(function () {

        const element = surface.current

        if (!dialog || !element || element.open) return

        prepareSurfaceEntrance(element, reducedMotion)

        element.showModal()

        enterSurface(element, reducedMotion)

        return function () {

            restSurface(element)

            if (element.open) element.close()
        }

    }, [dialogIdentity, reducedMotion])

    if (!dialog) return null

    return <dialog

        ref={surface}

        role="alertdialog"

        aria-modal="true"

        aria-labelledby={title}

        aria-describedby={description}

        style={{ borderRadius: radius }}

        onCancel={event => event.preventDefault()}

        className={`${taskbarSurfaceClassName} inset-auto inset-be-[calc(anchor(top)+var(--desktop-gutter))] inset-s-[anchor(center)] w-[min(28rem,calc(100vw-var(--desktop-gutter)*2))] -translate-x-1/2 backdrop:bg-transparent [position-anchor:--desktop-taskbar]`}

    >

        <TaskbarSurface label={dialog.kind === "permission" ? "Permission request" : "System error"} labelId={title}>

            {dialog.kind === "permission"

                ? <PermissionRequest key={dialog.identity} dialog={dialog} description={description} decide={choice => dialogManager.resolvePermission(dialog.identity, choice)} />

                : <CrashReport key={dialog.identity} dialog={dialog} description={description} acknowledge={() => dialogManager.acknowledge(dialog.identity)} />}

        </TaskbarSurface>

    </dialog>
}

function PermissionRequest({ dialog, description, decide }: PermissionRequestProps) {

    const decision = usePromise(decide)

    return <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-5 p-4">

        <span aria-hidden="true" className="grid size-8 place-items-center rounded-full border border-sky-600/25 bg-sky-500/15 text-sm font-medium">?</span>

        <div className="grid gap-1">

            <h3 className="text-base font-medium">{dialog.program.name} needs {dialog.title}</h3>

            <p id={description} className="text-sm leading-6 opacity-60">{dialog.description}</p>

            {dialog.values.length > 0 && <p className="text-xs leading-5 opacity-50">{dialog.values.join(", ")}</p>}

        </div>

        <div className="col-span-full flex flex-wrap justify-end gap-2">

            <TaskbarButton small disabled={decision.isPending} onClick={() => decision.safeExecute(false)}>Deny</TaskbarButton>

            <TaskbarButton small autoFocus disabled={decision.isPending} onClick={() => decision.safeExecute(null)}>Later</TaskbarButton>

            <TaskbarButton small disabled={decision.isPending} onClick={() => decision.safeExecute(true)}>Allow for this Program</TaskbarButton>

        </div>

        {decision.exception && <Alert className="col-span-full text-sm">{String(decision.exception.current)}</Alert>}

    </div>
}

function CrashReport({ dialog, description, acknowledge }: CrashReportProps) {

    const acknowledgment = usePromise(acknowledge)

    return <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-5 p-4">

        <span aria-hidden="true" className="grid size-8 place-items-center rounded-full border border-rose-600/25 bg-rose-500/15 text-lg font-medium">!</span>

        <div className="grid gap-1">

            <h3 className="text-base font-medium">Server endpoint crashed</h3>

            <p id={description} className="text-sm leading-6 opacity-60">{crashDescription(dialog)}</p>

        </div>

        <TaskbarButton

            small

            autoFocus

            disabled={acknowledgment.isPending}

            onClick={() => acknowledgment.safeExecute()}

            className="col-span-full justify-self-end font-medium"

        >

            I understand

        </TaskbarButton>

        {acknowledgment.exception && <Alert className="col-span-full text-sm">{String(acknowledgment.exception.current)}</Alert>}

    </div>
}

function crashDescription(dialog: ServerCrashDialog) {

    const endpoint = dialog.process.name ? `the “${dialog.process.name}” Process’s server endpoint` : "its server endpoint"

    if (dialog.signal) return `${dialog.program.name} stopped unexpectedly because ${endpoint} was terminated by ${dialog.signal}.`

    if (dialog.code !== null) return `${dialog.program.name} stopped unexpectedly because ${endpoint} exited with code ${dialog.code}.`

    return `${dialog.program.name} stopped because ${endpoint} ended unexpectedly.`
}

interface CrashReportProps {

    dialog: ServerCrashDialog

    description: string

    acknowledge(): Promise<void>
}

interface PermissionRequestProps {

    dialog: PermissionDialog
    description: string
    decide(choice: PermissionChoice): Promise<void>
}
