import { Menu } from "@phreshos/react-ui"
import { ArrowDownLeft, ArrowUpRight, LocateFixed, Magnet, Maximize2, Minimize2, X } from "@phreshos/react-ui/icons"

/**
 * What can be done to one standard Window, the same wherever it is offered: its Taskbar item and its
 * icon on the Map. Going to it and bringing it here move between views; the rest act on the Window
 * where it is, with the same icons as the Window's own title bar controls.
 */
export default function WindowMenu({ title, minimized, maximized, onGoTo, onBringHere, onToggleMinimized, onFill, onClose }: Readonly<{
    title: string
    minimized: boolean
    maximized: boolean
    onGoTo: () => void
    onBringHere: () => void
    onToggleMinimized: () => void
    onFill: () => void
    onClose: () => void
}>) {

    return <Menu aria-label={`${title} window actions`} size="small" onAction={action => {
        if (action === "goTo") onGoTo()
        else if (action === "bringHere") onBringHere()
        else if (action === "visibility") onToggleMinimized()
        else if (action === "fill") onFill()
        else if (action === "close") onClose()
    }}>

        <Menu.Item id="goTo" textValue="Go to"><LocateFixed aria-hidden />Go to</Menu.Item>

        <Menu.Item id="bringHere" textValue="Bring here"><Magnet aria-hidden />Bring here</Menu.Item>

        <Menu.Separator />

        <Menu.Item id="visibility" textValue={minimized ? "Show" : "Minimize"}>{minimized ? <><ArrowUpRight aria-hidden />Show</> : <><ArrowDownLeft aria-hidden />Minimize</>}</Menu.Item>

        <Menu.Item id="fill" textValue={maximized ? "Restore" : "Maximize"}>{maximized ? <><Minimize2 aria-hidden />Restore</> : <><Maximize2 aria-hidden />Maximize</>}</Menu.Item>

        <Menu.Separator />

        <Menu.Item id="close" color="danger" textValue="Close"><X aria-hidden />Close</Menu.Item>

    </Menu>
}
