import Process from "@client/core/link-manager/auth-manager/process-manager/process"
import { ContextMenu, Menu } from "@phreshos/react-ui"
import { useDesktopScaleContainer } from "../../desktop-scale"
import TaskbarItem from "./taskbar-item"
import { memo, useCallback } from "react"

/** A taskbar entry rerenders only when what that entry shows changes. */
export default memo(function ({ record, title, icon, active, minimized, maximized, onElement, onMinimize, onShow, onFill, onClose }: WindowTaskbarItemProps) {

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

            <TaskbarItem ref={source} active={active} icon={icon} onPress={press}>

                {title}

            </TaskbarItem>

        </ContextMenu.Trigger>

        <ContextMenu.Content UNSTABLE_portalContainer={scaleContainer ?? undefined}>

            <Menu aria-label={`${title} window actions`} size="small">

                <Menu.Item onAction={changeVisibility}>{minimized ? "Show" : "Minimize"}</Menu.Item>

                <Menu.Item onAction={fill}>{maximized ? "Restore" : "Maximize"}</Menu.Item>

                <Menu.Separator />

                <Menu.Item color="danger:base" onAction={close}>Close</Menu.Item>

            </Menu>

        </ContextMenu.Content>

    </ContextMenu>
})

interface WindowTaskbarItemProps {

    record: Process

    title: string

    icon: string

    active: boolean

    minimized: boolean

    maximized: boolean

    onElement: (record: Process, element: HTMLButtonElement | null) => void

    onMinimize: (record: Process, minimized: boolean) => void

    onShow: (record: Process) => void

    onFill: (record: Process) => void

    onClose: (record: Process) => void
}
