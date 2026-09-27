import Process from "@client/core/link-manager/auth-manager/process-manager/process"
import ClientState from "@client/core/link-manager/auth-manager/process-manager/client-state"
import { blockedProgramDocument, type ProgramAccess } from "./program-access"
import { type Theme } from "@phreshos/core"
import { type ReactEventHandler, useCallback, useRef } from "react"

export function programFrameSource(assetId: string, door: string) {

    return `${door}/${assetId}/assets/`
}

/** The document representation shared by every Client role. */
export default function ProgramFrame({ record, assetId, client, title, door, access, theme, className = "size-full border-0", onFrame, onLoad }: ProgramFrameProps) {

    const source = useCallback((element: HTMLIFrameElement | null) => onFrame(record.identity, element), [onFrame, record.identity])

    // The document is served in the Desktop's theme at the moment the frame loads it. A later theme
    // change must not change the address, which would reload the Program; the Program follows it itself.
    const frameSource = programFrameSource(assetId, door)

    const themed = useRef({ frameSource, source: `${frameSource}?theme=${theme}` })

    if (themed.current.frameSource !== frameSource) themed.current = { frameSource, source: `${frameSource}?theme=${theme}` }

    if (access === "checking") return null

    if (access === "blocked") return <iframe

        srcDoc={blockedProgramDocument}

        title={`${title}: Program unavailable`}

        className={className}

    />

    return <iframe

        src={themed.current.source}

        title={title}

        // Browser containment is fixed by the Client definition; permission
        // changes must never weaken or reload this execution boundary.
        sandbox={client.sandbox ? "allow-scripts allow-forms" : undefined}

        className={className}

        ref={source}

        onLoad={onLoad}

    />
}

interface ProgramFrameProps {

    record: Process

    assetId: string

    client: ClientState

    title: string

    door: string

    access: ProgramAccess

    theme: Theme

    className?: string

    onFrame: (identity: string, element: HTMLIFrameElement | null) => void

    onLoad: ReactEventHandler<HTMLIFrameElement>
}
