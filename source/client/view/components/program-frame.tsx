import Process from "@client/core/link-manager/auth-manager/process-manager/process"
import ClientState from "@client/core/link-manager/auth-manager/process-manager/client-state"
import { blockedProgramDocument, type ProgramAccess } from "./program-access"
import { type Theme } from "@phreshos/core"
import { type ReactEventHandler, useCallback } from "react"

export function programFrameSource(record: Process, client: ClientState, door: string) {

    return `${door}/${record.program}/assets/${client.window.location.slice(1)}`
}

/** The document representation shared by every Client role. */
export default function ProgramFrame({ record, client, title, door, access, theme, className = "size-full border-0", onFrame, onLoad }: ProgramFrameProps) {

    const source = useCallback((element: HTMLIFrameElement | null) => onFrame(record.identity, element), [onFrame, record.identity])

    if (access === "checking") return null

    if (access === "blocked") return <iframe

        srcDoc={blockedProgramDocument}

        title={`${title}: Program unavailable`}

        className={className}

    />

    return <iframe

        style={{ colorScheme: theme }}

        src={programFrameSource(record, client, door)}

        title={title}

        sandbox={`allow-scripts allow-forms${client.sameOrigin ? " allow-same-origin" : ""}`}

        className={className}

        ref={source}

        onLoad={onLoad}

    />
}

interface ProgramFrameProps {

    record: Process

    client: ClientState

    title: string

    door: string

    access: ProgramAccess

    theme: Theme

    className?: string

    onFrame: (identity: string, element: HTMLIFrameElement | null) => void

    onLoad: ReactEventHandler<HTMLIFrameElement>
}
