import Process from "@client/core/link-manager/auth-manager/process-manager/process"
import { type TaskbarPosition } from "@phreshos/core"
import { ContextMenu } from "@phreshos/react-ui"
import WindowMenu from "../../window-menu"
import { useDesktopScaleContainer } from "../../../../desktop-scale"
import TaskbarTooltip from "../taskbar-tooltip"
import TaskbarItem from "./taskbar-item"
import useDragHold from "../../../../drag-hold"
import { memo, useCallback } from "react"

/** A taskbar entry rerenders only when what that entry shows changes. */
export default memo(function ({ record, title, icon, position, active, minimized, maximized, onElement, onMinimize, onShow, onGoTo, onBringHere, onMaximize, onClose }: WindowTaskbarItemProps) {

    const scaleContainer = useDesktopScaleContainer()

    // A press takes you to the window, in whatever view it is, and brings it forward; pressing the
    // window in front hides it.
    const press = useCallback(function () {

        if (active) onMinimize(record, true)

        else onGoTo(record)

    }, [active, onMinimize, onGoTo, record])

    // A drag held over the entry takes you to its window too, even a minimized one, so the drop can
    // go there; unlike a press, it never minimizes the window.
    const goTo = useCallback(() => onGoTo(record), [onGoTo, record])
    const holdShows = useDragHold(goTo)
    const source = useCallback((element: HTMLButtonElement | null) => { onElement(record, element); holdShows(element) }, [onElement, record, holdShows])
    const changeVisibility = useCallback(() => {

        if (minimized) onShow(record)

        else onMinimize(record, true)

    }, [minimized, onMinimize, onShow, record])
    const maximize = useCallback(() => void onMaximize(record), [onMaximize, record])
    const bringHere = useCallback(() => onBringHere(record), [onBringHere, record])
    const close = useCallback(() => onClose(record), [onClose, record])

    // The title shows on hover and focus, since a Taskbar standing on its side has room for the icon alone.
    return <TaskbarTooltip label={title}><ContextMenu>

        <ContextMenu.Trigger>

            <TaskbarItem ref={source} active={active} icon={icon} position={position} onPress={press}>

                {title}

            </TaskbarItem>

        </ContextMenu.Trigger>

        <ContextMenu.Content portalContainer={scaleContainer ?? undefined}>

            <WindowMenu title={title} minimized={minimized} maximized={maximized}
                onGoTo={goTo} onBringHere={bringHere} onToggleMinimized={changeVisibility} onToggleMaximized={maximize} onClose={close} />

        </ContextMenu.Content>

    </ContextMenu></TaskbarTooltip>
})

interface WindowTaskbarItemProps {

    record: Process

    title: string

    icon: string

    position: TaskbarPosition

    active: boolean

    minimized: boolean

    maximized: boolean

    onElement: (record: Process, element: HTMLButtonElement | null) => void

    onMinimize: (record: Process, minimized: boolean) => void

    onShow: (record: Process) => void

    /** Brings the view to the Window and the Window to the front. */
    onGoTo: (record: Process) => void

    /** Moves the Window into the view on screen and brings it to the front. */
    onBringHere: (record: Process) => void

    onMaximize: (record: Process) => unknown

    onClose: (record: Process) => void
}
