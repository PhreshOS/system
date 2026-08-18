import Process from "@client/core/link-manager/auth-manager/process-manager/process"
import TaskbarItem from "./taskbar-item"
import { memo, useCallback } from "react"

/** A taskbar entry rerenders only when what that entry shows changes. */
export default memo(function ({ record, title, icon, active, onElement, onMinimize, onShow }: WindowTaskbarItemProps) {

    const press = useCallback(function () {

        if (active) onMinimize(record, true)

        else onShow(record)

    }, [active, onMinimize, onShow, record])

    const source = useCallback((element: HTMLButtonElement | null) => onElement(record, element), [onElement, record])

    return <TaskbarItem ref={source} active={active} icon={icon} onClick={press}>

        {title}

    </TaskbarItem>
})

interface WindowTaskbarItemProps {

    record: Process

    title: string

    icon: string

    active: boolean

    onElement: (record: Process, element: HTMLButtonElement | null) => void

    onMinimize: (record: Process, minimized: boolean) => void

    onShow: (record: Process) => void
}
