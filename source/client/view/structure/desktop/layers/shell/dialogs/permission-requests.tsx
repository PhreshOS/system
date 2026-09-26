import type { PermissionName, PermissionRequestSnapshot } from "@phreshos/core"
import { ReactTunnel } from "@the-link/react"
import { surfaceLifecyclePose, surfacePresenceTransition } from "@client/view/appearance/surface-presence"
import { useReducedMotion } from "@libs/react-motion"
import { motion } from "motion/react"
import { useEffect, useId, useRef } from "react"
import { AuthManagerContext } from "@client/view/contexts"
import ShellSurface, { shellSurfaceClassName } from "../shell-surface"
import usePromise from "@libs/react-promise"
import Alert from "@client/view/components/alert"
import { Button, useAppearance } from "@phreshos/react-ui"

/** Default Shell representation of raw pending permission requests. */
export default function PermissionRequests() {

    const manager = AuthManagerContext.useValue().permissionManager
    const inbound = ReactTunnel.useFactory(manager.$inbound)
    const requests = inbound.useFirstState("/requests", manager.list())
    const request = requests[0]
    const surface = useRef<HTMLDialogElement>(null)
    const title = useId()
    const description = useId()
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
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={title}
        aria-describedby={description}
        initial={reducedMotion ? surfaceLifecyclePose.visible : surfaceLifecyclePose.hidden}
        animate={surfaceLifecyclePose.visible}
        transition={surfacePresenceTransition(reducedMotion, transaction)}
        onCancel={event => event.preventDefault()}
        className={`${shellSurfaceClassName} pointer-events-auto fixed inset-0 m-auto h-fit w-[min(28rem,calc(100vw-var(--desktop-gutter)*2))] backdrop:bg-transparent`}
    >
        <ShellSurface material="full" label="Permission request" labelId={title}>
            <PermissionRequestView request={request} description={description} />
        </ShellSurface>
    </motion.dialog>
}

function PermissionRequestView({ request, description }: Readonly<{ request: PermissionRequestSnapshot, description: string }>) {

    const manager = AuthManagerContext.useValue().permissionManager
    const decision = usePromise((choice: "allow" | "deny" | "cancel") => manager[choice](request.identity))
    const presentation = permissionPresentation[request.name]
    const program = request.from.process.program

    return <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-5">
        <span aria-hidden="true" className="grid size-8 place-items-center rounded-full border border-sky-600/25 bg-sky-500/15 text-sm font-medium">?</span>
        <div className="grid gap-1">
            <h3 className="text-base font-medium">{program.name} needs {presentation.title}</h3>
            <p id={description} className="text-sm leading-6 opacity-60">{presentation.description}</p>
            {request.scope.length > 0 && <p className="text-xs leading-5 opacity-50">{request.scope.join(", ")}</p>}
        </div>
        <div className="col-span-full flex flex-wrap justify-end gap-2">
            <Button size="xsmall" disabled={decision.isPending} onPress={() => decision.safeExecute("deny")}>Deny</Button>
            <Button size="xsmall" autoFocus disabled={decision.isPending} onPress={() => decision.safeExecute("cancel")}>Cancel</Button>
            <Button size="xsmall" disabled={decision.isPending} onPress={() => decision.safeExecute("allow")}>Allow for this Program</Button>
        </div>
        {decision.exception && <Alert className="col-span-full text-sm">{String(decision.exception.current)}</Alert>}
    </div>
}

const permissionPresentation = {
    all: { title: "all permissions", description: "Grant every available Program permission." },
    services: { title: "Services", description: "Access Services by their Process and Service name." },
    programs: { title: "Programs", description: "Access every Program or selected Programs." },
    layers: { title: "Window layers", description: "Select raw Desktop layers in Client Endpoint launches." },
    network: { title: "Network", description: "Use System networking with every request target or selected target scopes." },
    storage: { title: "Storage", description: "Use every native filesystem path or selected operation-and-path scopes." },
    uploads: { title: "Uploads", description: "Create values in the System uploads collection." },
    logs: { title: "System logs", description: "Read and follow records produced by the System." },
    appearance: { title: "Appearance", description: "Change the System Appearance." },
    desktopPreferences: { title: "Desktop preferences", description: "Change this Desktop's preferences." },
    desktopConnection: { title: "Desktop connection", description: "Access the browser Connection carrying this Desktop and its Session." },
    authentication: { title: "Authentication", description: "Access and manage owner authentication, browser Connections, and Sessions." }
} satisfies Record<PermissionName, Readonly<{ title: string, description: string }>>
