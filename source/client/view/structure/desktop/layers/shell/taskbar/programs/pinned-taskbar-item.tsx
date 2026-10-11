import Program from "@client/core/link-manager/auth-manager/program-manager/program"
import { type TaskbarPosition } from "@phreshos/core"
import { ContextMenu, Menu } from "@phreshos/react-ui"
import { Plus, PinOff } from "@phreshos/react-ui/icons"
import { useDesktopScaleContainer } from "../../../../desktop-scale"
import { useLaunch } from "../../start-menu/programs/programs"
import TaskbarTooltip from "../taskbar-tooltip"
import TaskbarItem from "./taskbar-item"

/**
 * A Program pinned to the Taskbar: its place, kept whether it is closed or open, with its open
 * Windows right after it. It shows its icon alone; pressed, it opens the Program, as the Start Menu
 * does. Only a Program with a Client stands here: one without has nothing to show.
 */
export default function PinnedTaskbarItem({ program, icon, position }: Readonly<{ program: Program, icon: string, position: TaskbarPosition }>) {

    const scaleContainer = useDesktopScaleContainer()

    const launch = useLaunch()

    const open = () => void launch(program).catch(() => undefined)

    return <TaskbarTooltip label={program.name}><ContextMenu>

        <ContextMenu.Trigger>

            <TaskbarItem icon={icon} position={position} labeled={false} onPress={open}>{program.name}</TaskbarItem>

        </ContextMenu.Trigger>

        <ContextMenu.Content portalContainer={scaleContainer ?? undefined}>

            <Menu aria-label={`${program.name} on the Taskbar`} size="small" onAction={action => {
                if (action === "open") open()
                else if (action === "unpin") void program.pin(false).catch(() => undefined)
            }}>
                <Menu.Item id="open" textValue="Open"><Plus aria-hidden />Open</Menu.Item>
                <Menu.Separator />
                <Menu.Item id="unpin" textValue="Unpin"><PinOff aria-hidden />Unpin</Menu.Item>
            </Menu>

        </ContextMenu.Content>

    </ContextMenu></TaskbarTooltip>
}
