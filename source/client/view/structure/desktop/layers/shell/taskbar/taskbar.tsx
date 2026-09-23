import { type CSSProperties, type ReactNode } from "react"
import { Surface, Toolbar, type SurfaceProps } from "@phreshos/react-ui"
import { type AppearanceTaskbar } from "@phreshos/core"

/**
 * The Desktop's Taskbar is a Shell entity; React UI's Toolbar supplies the
 * control-group semantics and orientation-aware keyboard navigation.
 */
export default function Taskbar({ leading, trailing, taskbar, spacing, className, style, children, "aria-label": label = "Taskbar", ...props }: TaskbarProps) {

    const horizontal = taskbar.position === "top" || taskbar.position === "bottom"
    const orientation = horizontal ? "horizontal" : "vertical"

    return <Surface

        as={Toolbar}
        aria-label={label}
        orientation={orientation}
        gap="small"
        data-orientation={orientation}
        className={`pointer-events-auto isolate min-h-0 min-w-0 overflow-hidden p-1.5 ${className ?? ""}`}
        style={{ ...taskbarStyle(taskbar, spacing), alignItems: "center", ...style }}

        {...props}

        material="full"

    >

        <Toolbar.Group style={{ flexShrink: 0 }}>{leading}</Toolbar.Group>

        <Toolbar.Separator className="shadow-taskbar-separator" />

        <Toolbar.Group style={{ flex: "1 1 0", alignSelf: "stretch", minWidth: 0, minHeight: 0, overflow: "hidden" }}>

            {children}

        </Toolbar.Group>

        <Toolbar.Separator className="shadow-taskbar-separator" />

        <Toolbar.Group style={{ flexShrink: 0 }}>{trailing}</Toolbar.Group>

    </Surface>
}

interface TaskbarProps extends Omit<SurfaceProps<typeof Toolbar>, "as" | "children" | "orientation"> {

    children: ReactNode

    leading: ReactNode

    trailing: ReactNode

    taskbar: AppearanceTaskbar

    spacing: number
}

/** Taskbar size is its cross-axis extent; spacing remains its outer margin. */
export function taskbarStyle(taskbar: AppearanceTaskbar, spacing: number): CSSProperties {
    const horizontal = taskbar.position === "top" || taskbar.position === "bottom"

    return {
        position: "absolute",
        [taskbar.position]: spacing,
        ...(horizontal
            ? { left: spacing, right: spacing, width: "auto", height: taskbar.size }
            : { top: spacing, bottom: spacing, width: taskbar.size, height: "auto" })
    }
}
