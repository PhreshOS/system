import Process from "@client/core/link-manager/auth-manager/process-manager/process"
import ClientState from "@client/core/link-manager/auth-manager/process-manager/client-state"
import { type Theme } from "@phreshos/core"
import { type ReactEventHandler, useCallback } from "react"

export function programFrameSource(record: Process, client: ClientState, door: string) {

    const window = client.window

    return window.url

        ? new URL(window.location.slice(1), window.url).href

        : `${door}/${record.assetId}/assets/${window.location.slice(1)}`
}

/** The document representation shared by every Client role. */
export default function ProgramFrame({ record, client, title, door, theme, className = "size-full border-0", onFrame, onLoad }: ProgramFrameProps) {

    const source = useCallback((element: HTMLIFrameElement | null) => onFrame(record.identity, element), [onFrame, record.identity])

    return <iframe

        style={{ colorScheme: theme }}

        src={programFrameSource(record, client, door)}

        title={title}

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

    theme: Theme

    className?: string

    onFrame: (identity: string, element: HTMLIFrameElement | null) => void

    onLoad: ReactEventHandler<HTMLIFrameElement>
}
