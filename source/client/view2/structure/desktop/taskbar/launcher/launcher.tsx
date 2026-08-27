import { Popover } from "@heroui/react"
import StartMenu from "./start-menu"

export default function () {

    return <Popover>

        <Popover.Trigger aria-label="Start Menu" className="h-full min-w-[2.2rem] bg-danger" />

        <StartMenu />

    </Popover>
}