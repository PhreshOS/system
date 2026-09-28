import Process from "@client/core/link-manager/auth-manager/process-manager/process"
import { type TaskbarPosition } from "@phreshos/core"
import { ContextMenu, Menu } from "@phreshos/react-ui"
import { ArrowDownLeft, ArrowUpRight, LocateFixed, Maximize2, Minimize2, X } from "@phreshos/react-ui/icons"
import { useDesktopScaleContainer } from "../../../../desktop-scale"
import TaskbarItem from "./taskbar-item"
import { memo, useCallback } from "react"

/** A taskbar entry rerenders only when what that entry shows changes. */
export default memo(function ({ record, title, icon, position, active, minimized, maximized, onElement, onMinimize, onShow, onGoTo, onFill, onClose }: WindowTaskbarItemProps) {

    const scaleContainer = useDesktopScaleContainer()

    const press = useCallback(function () {

        if (active) onMinimize(record, true)

        else onShow(record)

    }, [active, onMinimize, onShow, record])

    const source = useCallback((element: HTMLButtonElement | null) => onElement(record, element), [onElement, record])
    const changeVisibility = useCallback(() => {

        if (minimized) onShow(record)

        else onMinimize(record, true)

    }, [minimized, onMinimize, onShow, record])
    const fill = useCallback(() => onFill(record), [onFill, record])
    const close = useCallback(() => onClose(record), [onClose, record])

    return <ContextMenu>

        <ContextMenu.Trigger>

            <TaskbarItem ref={source} active={active} icon={icon} position={position} onPress={press}>

                {title}

            </TaskbarItem>

        </ContextMenu.Trigger>

        <ContextMenu.Content portalContainer={scaleContainer ?? undefined}>

            <Menu aria-label={`${title} window actions`} size="small" onAction={action => {
                if (action === "goTo") onGoTo(record)
                else if (action === "visibility") changeVisibility()
                else if (action === "fill") fill()
                else if (action === "close") close()
            }}>

                {/* Where the Window is on the plane is the Map's concern; from here it is one choice away. */}
                <Menu.Item id="goTo" textValue="Go to"><LocateFixed aria-hidden />Go to</Menu.Item>

                <Menu.Separator />

                {/* The icons are the Window's own title bar controls. */}
                <Menu.Item id="visibility" textValue={minimized ? "Show" : "Minimize"}>{minimized ? <><ArrowUpRight aria-hidden />Show</> : <><ArrowDownLeft aria-hidden />Minimize</>}</Menu.Item>

                <Menu.Item id="fill" textValue={maximized ? "Restore" : "Maximize"}>{maximized ? <><Minimize2 aria-hidden />Restore</> : <><Maximize2 aria-hidden />Maximize</>}</Menu.Item>

                <Menu.Separator />

                <Menu.Item id="close" color="danger" textValue="Close"><X aria-hidden />Close</Menu.Item>

            </Menu>

        </ContextMenu.Content>

    </ContextMenu>
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

    onFill: (record: Process) => void

    onClose: (record: Process) => void
}
