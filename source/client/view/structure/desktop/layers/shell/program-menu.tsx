import type Program from "@client/core/link-manager/auth-manager/program-manager/program"
import { Menu } from "@phreshos/react-ui"
import { AppWindow, Pin, PinOff, Trash2 } from "@phreshos/react-ui/icons"
import { useUninstallProgram } from "./dialogs/uninstall-program"

/**
 * What can be done to one Program where the Desktop offers it: the Start Menu and its place on the
 * Taskbar. Open starts it as choosing it does; Pin keeps its place on the Taskbar, closed or open;
 * Uninstall removes an installed one once the owner confirms.
 */
export default function ProgramMenu({ program, onOpen }: Readonly<{ program: Program, onOpen: () => void }>) {

    const { pinnedAt, installedAt } = program

    const uninstall = useUninstallProgram()

    return <Menu aria-label={`${program.name} actions`} size="small" onAction={action => {
        if (action === "open") onOpen()
        else if (action === "pin") void program.pin(pinnedAt === null).catch(() => undefined)
        else if (action === "uninstall") uninstall(program)
    }}>

        <Menu.Item id="open" textValue="Open"><AppWindow aria-hidden />Open</Menu.Item>

        <Menu.Separator />

        <Menu.Item id="pin" textValue={pinnedAt !== null ? "Unpin" : "Pin"}>{pinnedAt !== null ? <><PinOff aria-hidden />Unpin</> : <><Pin aria-hidden />Pin</>}</Menu.Item>

        {installedAt !== null && <>

            <Menu.Separator />

            <Menu.Item id="uninstall" color="danger" textValue="Uninstall"><Trash2 aria-hidden />Uninstall</Menu.Item>

        </>}

    </Menu>
}
