import type { ReactNode } from "react"
import type { BeginWindowMoveGesture } from "@phreshos/core"
import { Window } from "@phreshos/react-ui"

/** Connects Desktop Window behavior to React UI's shared header. */
export default function WindowHeader({ title, icon, active, whole, stopping, beginMoveGesture, onMinimize, onMaximize, onClose }: WindowHeaderProps) {
    return <Window.Header active={active} beginMoveGesture={beginMoveGesture} maximized={whole} onMaximize={onMaximize}>
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
    whole: boolean
    stopping: boolean
    beginMoveGesture: BeginWindowMoveGesture
    onMinimize?: () => void
    onMaximize?: () => void
    onClose?: () => void
}
