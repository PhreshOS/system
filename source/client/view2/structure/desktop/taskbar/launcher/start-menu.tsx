import { Surface } from "@heroui/react"

export default function ({ id }: { id: string }) {

    return <Surface

        id={id}

        popover="auto"

        aria-label="Start Menu"

        className="inset-auto inset-be-[calc(anchor(top)+var(--spacing)*2.5)] inset-s-[anchor(start)] m-0 size-80 rounded-lg border-0 p-0 outline-none [position-anchor:--desktop-taskbar]"

    >{null}</Surface>
}
