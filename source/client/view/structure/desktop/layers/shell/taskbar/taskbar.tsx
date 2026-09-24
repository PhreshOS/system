import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { Surface, Toolbar, useAppearance, type SurfaceProps } from "@phreshos/react-ui"
import { type AppearanceTaskbar, type TaskbarPosition } from "@phreshos/core"
import { useReducedMotion } from "@libs/react-motion"
import { cssEasing } from "@client/view/appearance/motion"

/**
 * The Desktop's Taskbar is a Shell entity; React UI's Toolbar supplies the
 * control-group semantics and orientation-aware keyboard navigation.
 */
export default function Taskbar({ leading, trailing, taskbar, spacing, keepVisible = false, className, style, children, onPointerEnter, "aria-label": label = "Taskbar", ...props }: TaskbarProps) {

    const horizontal = taskbar.position === "top" || taskbar.position === "bottom"
    const orientation = horizontal ? "horizontal" : "vertical"
    const transaction = useAppearance().transaction
    const reducedMotion = useReducedMotion()
    const [revealed, setRevealed] = useState(false)
    const configuration = { position: taskbar.position, overlay: taskbar.overlay }
    const previousConfiguration = useRef(configuration)
    const configurationChanged = taskbarConfigurationChanged(previousConfiguration.current, configuration)
    const visible = taskbarVisible(taskbar, revealed, keepVisible, configurationChanged)

    useLayoutEffect(() => {
        if (!configurationChanged) return
        // A reveal belongs to the edge that detected the pointer. Carrying it
        // across an Appearance relocation paints one visible frame at the new edge.
        previousConfiguration.current = configuration
        setRevealed(false)
    }, [configurationChanged, taskbar.overlay, taskbar.position])

    return <div
        data-taskbar-region=""
        className="pointer-events-none absolute"
        style={taskbarRegionStyle(taskbar, spacing)}
        onPointerLeave={() => setRevealed(false)}
    >

        {taskbar.overlay && visible ? <div
            data-taskbar-retention-region=""
            aria-hidden="true"
            className="pointer-events-auto absolute inset-0"
        /> : null}

        {taskbar.overlay ? <div
            data-taskbar-reveal-region=""
            aria-hidden="true"
            className="pointer-events-auto absolute"
            style={taskbarRevealRegionStyle(taskbar.position, spacing)}
            onPointerEnter={() => setRevealed(true)}
        /> : null}

        <Surface

            as={Toolbar}
            aria-label={label}
            orientation={orientation}
            gap="small"
            data-orientation={orientation}
            className={`pointer-events-auto isolate min-h-0 min-w-0 overflow-hidden p-1.5 ${className ?? ""}`}
            style={{
                ...taskbarStyle(taskbar, spacing),
                alignItems: "center",
                transform: taskbarOverlayTransform(taskbar.position, visible, spacing),
                transitionDuration: reducedMotion || configurationChanged ? "0ms" : `${transaction.duration}ms`,
                transitionTimingFunction: cssEasing(transaction.easing),
                transitionProperty: "transform",
                ...style
            }}

            {...props}

            material="full"

            onPointerEnter={event => {
                setRevealed(true)
                onPointerEnter?.(event)
            }}

        >

            <Toolbar.Group style={{ flexShrink: 0 }}>{leading}</Toolbar.Group>

            <Toolbar.Separator className="shadow-taskbar-separator" />

            <Toolbar.Group style={{ flex: "1 1 0", alignSelf: "stretch", minWidth: 0, minHeight: 0, overflow: "hidden" }}>

                {children}

            </Toolbar.Group>

            <Toolbar.Separator className="shadow-taskbar-separator" />

            <Toolbar.Group style={{ flexShrink: 0 }}>{trailing}</Toolbar.Group>

        </Surface>

    </div>
}

interface TaskbarProps extends Omit<SurfaceProps<typeof Toolbar>, "as" | "children" | "orientation"> {

    children: ReactNode

    leading: ReactNode

    trailing: ReactNode

    taskbar: AppearanceTaskbar

    spacing: number

    /** Retains an overlay Taskbar while an anchored Shell surface is open. */
    keepVisible?: boolean
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

/** Bounds shared by the edge sensor and the revealed Taskbar. */
export function taskbarRegionStyle(taskbar: AppearanceTaskbar, spacing: number): CSSProperties {
    const horizontal = taskbar.position === "top" || taskbar.position === "bottom"

    return {
        [taskbar.position]: 0,
        ...(horizontal
            ? { left: 0, right: 0, height: taskbar.size + spacing + taskbarRetentionDistance }
            : { top: 0, bottom: 0, width: taskbar.size + spacing + taskbarRetentionDistance })
    }
}

/** Fixed inward distance a revealed overlay Taskbar retains pointer ownership. */
export const taskbarRetentionDistance = 50

interface TaskbarVisibilityConfiguration {
    position: TaskbarPosition
    overlay: boolean
}

export function taskbarConfigurationChanged(previous: TaskbarVisibilityConfiguration, current: TaskbarVisibilityConfiguration) {
    return previous.position !== current.position || previous.overlay !== current.overlay
}

export function taskbarVisible(taskbar: AppearanceTaskbar, revealed: boolean, keepVisible: boolean, configurationChanged: boolean) {
    return !taskbar.overlay || keepVisible || revealed && !configurationChanged
}

/** The outer Appearance spacing is the non-obstructing reveal target. */
export function taskbarRevealRegionStyle(position: TaskbarPosition, spacing: number): CSSProperties {
    const horizontal = position === "top" || position === "bottom"

    return {
        [position]: 0,
        ...(horizontal
            ? { left: 0, right: 0, height: spacing }
            : { top: 0, bottom: 0, width: spacing })
    }
}

/** Moves an overlay Taskbar wholly beyond its configured Desktop edge. */
export function taskbarOverlayTransform(position: TaskbarPosition, visible: boolean, spacing: number) {
    if (visible) return "translate(0)"
    if (position === "top") return `translateY(calc(-100% - ${spacing}px))`
    if (position === "bottom") return `translateY(calc(100% + ${spacing}px))`
    if (position === "left") return `translateX(calc(-100% - ${spacing}px))`
    return `translateX(calc(100% + ${spacing}px))`
}
