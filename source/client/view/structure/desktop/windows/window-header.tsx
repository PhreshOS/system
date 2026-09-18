import type { PointerEvent as ReactPointerEvent, ReactNode } from "react"
import { WindowHeader as Header } from "@phreshos/react-ui"

/** Connects Desktop Window behavior to React UI's shared header. */
export default function WindowHeader({ title, icon, active, whole, stopping, onGrab, onMinimize, onMaximize, onClose }: WindowHeaderProps) {
    return <Header active={active} onPointerDown={onGrab} onDoubleClick={onMaximize}>
        <Header.Identity icon={icon} title={title} />
        <Header.Actions>
            {onMinimize && <Header.Minimize onPress={onMinimize} />}
            {onMaximize && <Header.Maximize maximized={whole} onPress={onMaximize} />}
            {onClose && <Header.Close onPress={onClose} disabled={stopping} />}
        </Header.Actions>
    </Header>
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
