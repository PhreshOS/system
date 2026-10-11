import type Program from "@client/core/link-manager/auth-manager/program-manager/program"
import { Menu } from "@phreshos/react-ui"
import { AppWindow, Pin, PinOff } from "@phreshos/react-ui/icons"

/**
 * What can be done to one Program where the Desktop offers it: the Start Menu and its place on the
 * Taskbar. Open starts it as choosing it does; Pin keeps its place on the Taskbar, closed or open.
 */
export default function ProgramMenu({ program, onOpen }: Readonly<{ program: Program, onOpen: () => void }>) {

    return <Menu aria-label={`${program.name} actions`} size="small" onAction={action => {
        if (action === "open") onOpen()
        else if (action === "pin") void program.pin(!program.pinned).catch(() => undefined)
    }}>

        <Menu.Item id="open" textValue="Open"><AppWindow aria-hidden />Open</Menu.Item>

        <Menu.Separator />

        <Menu.Item id="pin" textValue={program.pinned ? "Unpin" : "Pin"}>{program.pinned ? <><PinOff aria-hidden />Unpin</> : <><Pin aria-hidden />Pin</>}</Menu.Item>

    </Menu>
}
