import { parseSystemLogRecord, type SystemLogRecord } from "@phreshos/core"
import { ReactTunnel } from "@the-link/react"
import { useCallback, useState } from "react"
import { AuthManagerContext } from "@client/view/contexts"
import { AlertDialog, Button } from "@phreshos/react-ui"
import { useDesktopScaleContainer } from "../../../desktop-scale"
import useShown from "./shown"

/** Shell-owned real-time presentation of new System errors. */
export default function SystemErrors() {

    const authManager = AuthManagerContext.useValue()

    const inbound = ReactTunnel.useFactory(authManager.$inbound)

    const [record, setRecord] = useState<SystemLogRecord | null>(null)

    inbound.useSubscribe("/logs/log", useCallback((value: unknown) => {

        const received = parseSystemLogRecord(value)

        if (received.level === "error") setRecord(received)
    }, []))

    const container = useDesktopScaleContainer()

    const shown = useShown(record ?? undefined)

    // The latest error replaces what the open dialog shows; it does not close and reopen it.
    return <AlertDialog open={record !== null}>

        <AlertDialog.Backdrop portalContainer={container ?? undefined}>

            <AlertDialog.Content style={{ width: "28rem" }}>

                {shown && <>

                    <AlertDialog.Header>

                        <AlertDialog.Title>{errorTitle(shown)}</AlertDialog.Title>

                        <AlertDialog.Description>{shown.content}</AlertDialog.Description>

                    </AlertDialog.Header>

                    <AlertDialog.Footer>

                        <Button autoFocus onPress={() => setRecord(null)}>I understand</Button>

                    </AlertDialog.Footer>

                </>}

            </AlertDialog.Content>

        </AlertDialog.Backdrop>

    </AlertDialog>
}

function errorTitle(record: SystemLogRecord) {

    return record.kind === "unexpectedServerEndpointExit" ? "Server endpoint stopped unexpectedly" : "System error"
}
