import { parseSystemLogRecord, type SystemLogRecord } from "@phreshos/core"
import { ReactTunnel } from "@the-link/react"
import { surfaceLifecyclePose, surfacePresenceTransition } from "@client/view/appearance/surface-presence"
import { useReducedMotion } from "@libs/react-motion"
import { motion } from "motion/react"
import { useCallback, useEffect, useId, useRef, useState } from "react"
import { AuthManagerContext } from "@client/view/contexts"
import ShellSurface, { shellSurfaceClassName } from "../shell-surface"
import { Button, useAppearance } from "@phreshos/react-ui"

/** Shell-owned real-time presentation of new System errors. */
export default function SystemErrors() {

    const authManager = AuthManagerContext.useValue()

    const inbound = ReactTunnel.useFactory(authManager.$inbound)

    const [record, setRecord] = useState<SystemLogRecord | null>(null)

    inbound.useSubscribe("/logs/log", useCallback((value: unknown) => {

        const received = parseSystemLogRecord(value)

        if (received.level === "error") setRecord(received)
    }, []))

    const surface = useRef<HTMLDialogElement>(null)

    const title = useId()

    const description = useId()

    const reducedMotion = useReducedMotion()

    const transaction = useAppearance().transaction

    const visible = record !== null

    useEffect(function () {

        const element = surface.current

        if (!visible || !element || element.open) return

        element.showModal()

        return function () {

            if (element.open) element.close()
        }

    // The latest error may replace the visible content, but it must not close
    // and reopen the same Shell-owned dialog merely because its record changed.
    }, [visible])

    if (!record) return null

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

        <ShellSurface material="full" label="System error" labelId={title}>

            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-5 p-4">

                <span aria-hidden="true" className="grid size-8 place-items-center rounded-full border border-rose-600/25 bg-rose-500/15 text-lg font-medium">!</span>

                <div className="grid gap-1">

                    <h3 className="text-base font-medium">{errorTitle(record)}</h3>

                    <p id={description} className="text-sm leading-6 opacity-60">{record.content}</p>

                </div>

                <Button size="xsmall" autoFocus onPress={() => setRecord(null)} className="col-span-full justify-self-end font-medium">

                    I understand

                </Button>

            </div>

        </ShellSurface>

    </motion.dialog>
}

function errorTitle(record: SystemLogRecord) {

    return record.kind === "unexpectedServerEndpointExit" ? "Server endpoint stopped unexpectedly" : "System error"
}
