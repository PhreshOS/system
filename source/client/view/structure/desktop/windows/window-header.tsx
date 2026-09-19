import type { PointerEvent as ReactPointerEvent, ReactNode } from "react"
import { Window } from "@phreshos/react-ui"

/** Connects Desktop Window behavior to React UI's shared header. */
export default function WindowHeader({ title, icon, active, whole, stopping, onGrab, onMinimize, onMaximize, onClose }: WindowHeaderProps) {
    return <Window.Header active={active} onPointerDown={onGrab} onDoubleClick={onMaximize}>
        <Window.Header.Identity icon={icon} title={title} />
        <Window.Header.Actions>
            {onMinimize && <Window.Header.Minimize onPress={onMinimize} />}
            {onMaximize && <Window.Header.Maximize maximized={whole} onPress={onMaximize} />}
            {onClose && <Window.Header.Close onPress={onClose} disabled={stopping} />}
        </Window.Header.Actions>
    </Window.Header>
}

interface WindowHeaderProps {
    title?: ReactNode
    icon: string
    active: boolean
    whole: boolean
    stopping: boolean
    onGrab: (event: ReactPointerEvent<HTMLElement>) => void
    onMinimize?: () => void
    onMaximize?: () => void
    onClose?: () => void
}
