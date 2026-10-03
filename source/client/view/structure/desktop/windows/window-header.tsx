import type { ReactNode } from "react"
import type { BeginPresentationMoveGesture } from "@phreshos/core"
import { Window } from "@phreshos/react-ui"

/** Connects Desktop Window behavior to React UI's shared header. */
export default function WindowHeader({ title, icon, active, maximized, stopping, beginMoveGesture, onMinimize, onMaximize, onClose }: WindowHeaderProps) {
    return <Window.Header active={active} beginMoveGesture={beginMoveGesture} maximized={maximized} onMaximize={onMaximize}>
        <Window.Header.Identity icon={icon} title={title} />
        <Window.Header.Actions>
            {/* The Desktop transfers focus before either operation makes the
                iframe unavailable. React Aria must not preserve focus in that
                disappearing cross-document target. */}
            {onMinimize && <Window.Header.Minimize preventFocusOnPress={false} onPress={onMinimize} />}
            {onMaximize && <Window.Header.Maximize />}
            {onClose && <Window.Header.Close preventFocusOnPress={false} onPress={onClose} disabled={stopping} />}
        </Window.Header.Actions>
    </Window.Header>
}

interface WindowHeaderProps {
    title?: ReactNode
    icon: string
    active: boolean
    maximized: boolean
    stopping: boolean
    beginMoveGesture: BeginPresentationMoveGesture
    onMinimize?: () => void
    onMaximize?: () => void
    onClose?: () => void
}
