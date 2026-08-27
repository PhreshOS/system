import { Surface } from "@heroui/react"
import { CSSProperties } from "react"

const position = {

    positionAnchor: "--desktop-taskbar",

    top: "auto",

    right: "auto",

    bottom: "auto",

    left: "auto",

    insetBlockEnd: "calc(anchor(top) + var(--spacing) * 2.5)",

    insetInlineStart: "anchor(start)"

} satisfies CSSProperties

export default function ({ id }: { id: string }) {

    return <Surface id={id} popover="auto" aria-label="Start Menu" style={position} className="m-0 size-80 rounded-lg border-0 p-0 outline-none">{null}</Surface>
}
