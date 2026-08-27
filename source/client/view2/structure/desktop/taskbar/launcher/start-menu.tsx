import { Popover } from "@heroui/react"
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

export default function () {

    return <Popover.Content aria-label="Start Menu" placement="top start" style={position} className="size-80 rounded-lg">{null}</Popover.Content>
}
