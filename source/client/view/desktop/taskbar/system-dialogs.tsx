import { type PermissionChoice, type PermissionDialog, type ServerCrashDialog } from "@server/core/dialog-manager"
import ReactTunnel from "@libs/the-link/plugins/react-helper/react-tunnel"
import { enterSurface, prepareSurfaceEntrance, restSurface } from "../../appearance/surface-presence"
import { systemDialogStyle } from "../geometry"
import { useReducedMotion } from "@libs/react-motion"
import { useTheme } from "@phreshos/react-ui"
import { numericScale } from "@phreshos/core"
import { useEffect, useId, useRef } from "react"
import { AuthManagerContext } from "../../contexts"
import TaskbarSurface, { taskbarSurfaceClassName } from "./taskbar-surface"
import TaskbarButton from "./taskbar-button"

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

    const radius = numericScale(useTheme().radius).large

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

        style={{ ...systemDialogStyle, borderRadius: radius }}

        onCancel={event => event.preventDefault()}

        className={`${taskbarSurfaceClassName} grid grid-rows-[auto_minmax(0,1fr)] backdrop:bg-transparent`}

    >

        <TaskbarSurface label={dialog.kind === "permission" ? "Permission request" : "System error"} labelId={title}>

            {dialog.kind === "permission"

                ? <PermissionRequest dialog={dialog} description={description} decide={choice => dialogManager.resolvePermission(dialog.identity, choice)} />

                : <CrashReport dialog={dialog} description={description} acknowledge={() => dialogManager.acknowledge(dialog.identity)} />}

        </TaskbarSurface>

    </dialog>
}

function PermissionRequest({ dialog, description, decide }: PermissionRequestProps) {

    return <div className="grid gap-5 p-4">

        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3">

            <span aria-hidden="true" className="grid size-8 place-items-center rounded-full border border-sky-600/25 bg-sky-500/15 text-sm font-medium text-sky-800">?</span>

            <div className="grid gap-1">

                <h3 className="text-base font-medium text-slate-900">{dialog.program.name} needs permission</h3>

                <p id={description} className="text-sm leading-6 text-slate-600">{permissionDescription(dialog)}</p>

            </div>

        </div>

        <div className="flex flex-wrap justify-end gap-2">

            <TaskbarButton small onClick={() => decide(false).catch(() => undefined)}>Deny</TaskbarButton>

            <TaskbarButton small autoFocus onClick={() => decide(null).catch(() => undefined)}>Later</TaskbarButton>

            <TaskbarButton small onClick={() => decide("process").catch(() => undefined)}>Allow for this Process</TaskbarButton>

            <TaskbarButton small onClick={() => decide("always").catch(() => undefined)}>Always allow</TaskbarButton>

        </div>

    </div>
}

function CrashReport({ dialog, description, acknowledge }: CrashReportProps) {

    return <div className="grid gap-5 p-4">

        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3">

            <span aria-hidden="true" className="grid size-8 place-items-center rounded-full border border-rose-600/25 bg-rose-500/15 text-lg font-medium text-rose-700">!</span>

            <div className="grid gap-1">

                <h3 className="text-base font-medium text-slate-900">Server endpoint crashed</h3>

                <p id={description} className="text-sm leading-6 text-slate-600">{crashDescription(dialog)}</p>

            </div>

        </div>

        <div className="grid justify-end">

            <TaskbarButton

                small

                autoFocus

                onClick={() => acknowledge().catch(() => undefined)}

                className="font-medium"

            >

                I understand

            </TaskbarButton>

        </div>

    </div>
}

function permissionDescription(dialog: PermissionDialog) {

    if (dialog.permission === "pointer") return "Allow this Program to read and listen to pointer movement across the desktop."

    return unknownPermission(dialog.permission)
}

function unknownPermission(permission: never): never {

    throw new Error(`The system has no description for permission "${permission}"`)
}

function crashDescription(dialog: ServerCrashDialog) {

    const endpoint = dialog.process.name ? `the “${dialog.process.name}” Process’s server endpoint` : "its server endpoint"

    if (dialog.signal) return `${dialog.program.name} stopped unexpectedly because ${endpoint} was terminated by ${dialog.signal}.`

    if (dialog.code !== null) return `${dialog.program.name} stopped unexpectedly because ${endpoint} exited with code ${dialog.code}.`

    return `${dialog.program.name} stopped because ${endpoint} ended unexpectedly.`
}

interface PermissionRequestProps {

    dialog: PermissionDialog

    description: string

    decide(choice: PermissionChoice): Promise<void>
}

interface CrashReportProps {

    dialog: ServerCrashDialog

    description: string

    acknowledge(): Promise<void>
}
