import { Tooltip } from "@phreshos/react-ui"
import { type TaskbarPosition } from "@phreshos/core"
import { useProperty } from "@the-link/react"
import { type ReactNode } from "react"
import { LinkManagerContext } from "../../../../../contexts"
import { useDesktopScaleContainer } from "../../../desktop-scale"

/**
 * A Taskbar control's name, shown on hover and focus on the side away from the screen's edge while
 * the control shows its icon alone.
 */
export default function TaskbarTooltip({ label, iconOnly = true, children }: Readonly<{ label: string, iconOnly?: boolean, children: ReactNode }>) {

    const { position } = useProperty(LinkManagerContext.useValue().appearance).taskbar

    const scaleContainer = useDesktopScaleContainer()

    return <Tooltip disabled={!iconOnly}>

        {children}

        <Tooltip.Content placement={away[position]} portalContainer={scaleContainer ?? undefined}>{label}</Tooltip.Content>

    </Tooltip>
}

const away: Readonly<Record<TaskbarPosition, "top" | "bottom" | "left" | "right">> = { top: "bottom", bottom: "top", left: "right", right: "left" }
