import type { PermissionName, PermissionRequestSnapshot } from "@phreshos/core"
import { ReactTunnel } from "@the-link/react"
import { AuthManagerContext } from "@client/view/contexts"
import usePromise from "@libs/react-promise"
import Alert from "@client/view/components/alert"
import { AlertDialog, Button, Text } from "@phreshos/react-ui"
import { useDesktopScaleContainer } from "../../../desktop-scale"
import useShown from "./shown"

/**
 * Default Shell representation of raw pending permission requests: the first one waiting, as an
 * AlertDialog over the dimmed Desktop, which only a decision ends.
 */
export default function PermissionRequests() {

    const manager = AuthManagerContext.useValue().permissionManager
    const inbound = ReactTunnel.useFactory(manager.$inbound)
    const requests = inbound.useFirstState("/requests", manager.list())
    const request = requests[0]
    const container = useDesktopScaleContainer()
    // The request stays shown while the dialog leaves, so it does not empty as it fades.
    const shown = useShown(request)

    return <AlertDialog open={request !== undefined}>
        <AlertDialog.Backdrop portalContainer={container ?? undefined}>
            <AlertDialog.Content style={{ width: "28rem" }}>
                {shown && <PermissionRequestView request={shown} />}
            </AlertDialog.Content>
        </AlertDialog.Backdrop>
    </AlertDialog>
}

function PermissionRequestView({ request }: Readonly<{ request: PermissionRequestSnapshot }>) {

    const manager = AuthManagerContext.useValue().permissionManager
    const decision = usePromise((choice: "allow" | "deny" | "cancel") => manager[choice](request.identity))
    const presentation = permissionPresentation[request.name]
    const program = request.from.process.program

    return <>
        <AlertDialog.Header>
            <AlertDialog.Title>{program.name} needs {presentation.title}</AlertDialog.Title>
            <AlertDialog.Description>{presentation.description}</AlertDialog.Description>
        </AlertDialog.Header>
        {(request.scope.length > 0 || decision.exception) && <AlertDialog.Body>
            {request.scope.length > 0 && <Text size="small" tone="secondary">{request.scope.join(", ")}</Text>}
            {decision.exception && <Alert className="text-sm">{String(decision.exception.current)}</Alert>}
        </AlertDialog.Body>}
        <AlertDialog.Footer>
            <Button disabled={decision.isPending} onPress={() => decision.safeExecute("deny")}>Deny</Button>
            <Button autoFocus disabled={decision.isPending} onPress={() => decision.safeExecute("cancel")}>Cancel</Button>
            <Button disabled={decision.isPending} onPress={() => decision.safeExecute("allow")}>Allow for this Program</Button>
        </AlertDialog.Footer>
    </>
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
    desktopViewport: { title: "Desktop view", description: "Move where this Desktop looks on the plane of Windows." },
    desktopConnection: { title: "Desktop connection", description: "Access the browser Connection carrying this Desktop and its Session." },
    authentication: { title: "Authentication", description: "Access and manage owner authentication, browser Connections, and Sessions." }
} satisfies Record<PermissionName, Readonly<{ title: string, description: string }>>
