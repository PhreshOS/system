import type { OpenRequestSnapshot } from "@phreshos/core"
import { ReactTunnel } from "@the-link/react"
import { useState } from "react"
import { ApplicationContext, AuthManagerContext } from "@client/view/contexts"
import { useDesktopScaleContainer } from "../../../desktop-scale"
import useShown from "./shown"
import usePromise from "@libs/react-promise"
import Alert from "@client/view/components/alert"
import usePrograms from "@client/view/structure/desktop/programs/programs"
import programIcon from "@client/view/structure/desktop/programs/program-icon"
import { Button, Checkbox, Dialog, Text, useAppearance, useScale } from "@phreshos/react-ui"

/**
 * The default Shell's choice of a Program for something that has no default one: the first request
 * waiting, as a Dialog over the dimmed Desktop, which a choice or Cancel ends.
 */
export default function OpenRequests() {

    const manager = AuthManagerContext.useValue().openingManager
    const inbound = ReactTunnel.useFactory(manager.$inbound)
    const requests = inbound.useFirstState("/requests", manager.list())
    const request = requests[0]
    const container = useDesktopScaleContainer()
    const shown = useShown(request)

    return <Dialog open={request !== undefined}>
        <Dialog.Backdrop portalContainer={container ?? undefined} keyboardDismissable={false}>
            <Dialog.Content style={{ width: "24rem" }}>
                {shown && <OpenRequestView request={shown} />}
            </Dialog.Content>
        </Dialog.Backdrop>
    </Dialog>
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

    return <>
        <Dialog.Header>
            <Dialog.Title>Open with</Dialog.Title>
        </Dialog.Header>
        <Dialog.Body>
            <div className="grid" style={{ gap: space.xsmall }}>
                <span className="truncate" title={request.target.uri}><Text size="small" style={{ fontWeight: 500 }}>{describe(request.target.uri)}</Text></span>
                <Dialog.Description>{request.from ? `${request.from.process.program.name} asks to open it` : "Opened from outside the Desktop"} · {request.target.type}</Dialog.Description>
            </div>
            <div className="grid" style={{ gap: space.xsmall }}>
                {programs.map(program => <Button key={program.identity} disabled={decision.isPending} onPress={() => decision.safeExecute(program.identity)}
                    style={{ justifyContent: "flex-start" }}>
                    <img src={programIcon(application.doors.program, program.assetId)} alt="" draggable={false} className="shrink-0 object-contain" style={{ width: space.large, height: space.large }} />
                    {program.name}
                </Button>)}
            </div>
            <Checkbox size="small" checked={always} onChange={setAlways} label={`Always open ${request.target.type} with it`} />
            {decision.exception && <Alert className="text-sm">{String(decision.exception.current)}</Alert>}
        </Dialog.Body>
        <Dialog.Footer>
            <Button autoFocus disabled={decision.isPending} onPress={() => decision.safeExecute(null)}>Cancel</Button>
        </Dialog.Footer>
    </>
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
