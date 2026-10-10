import PhreshOSIcon from "@client/view/components/phreshos-icon"
import { createContext, memo, useContext, useId, type CSSProperties, type PropsWithChildren } from "react"
import StartMenuPanel from "./start-menu-panel"
import { name } from "@/source/identity"
import { type AppearanceTaskbar } from "@phreshos/core"
import { useReducedMotion } from "@libs/react-motion"
import { motion } from "motion/react"
import { shellSurfaceClassName } from "../shell-surface"
import { useShellPopover } from "../shell-popover"
import TaskbarButton from "../taskbar/taskbar-button"
import { useTiming } from "@phreshos/react-ui"
import { surfacePresenceTransition } from "@client/view/appearance/surface-presence"
import { usePortrait } from "../../../orientation"
import { useDesktopScale } from "../../../desktop-scale"

const StartMenuContext = createContext<StartMenuControl | null>(null)

/** Shared behavior only; the Taskbar trigger and Shell surface remain siblings. */
export function StartMenuProvider({ taskbar, spacing, children }: PropsWithChildren<{
    taskbar: AppearanceTaskbar
    spacing: number
}>) {

    const id = useId()

    const popover = useShellPopover()

    return <StartMenuContext.Provider value={{ id, taskbar, spacing, popover }}>

        {children}

    </StartMenuContext.Provider>
}

/** The Start Menu's Taskbar-owned anchor and toggle. */
export const StartMenuButton = memo(function StartMenuButton({ showLabel = true }: Readonly<{ showLabel?: boolean }>) {

    const control = useStartMenuControl()

    return <TaskbarButton
        icon={<PhreshOSIcon className="block size-full" />}
        label={name}
        showLabel={showLabel}
        color="default:base"
        material="extended"
        aria-controls={control.id}
        aria-expanded={control.popover.open}
        aria-haspopup="dialog"
        aria-label={name}
        onPress={control.popover.toggle}
    />
})

/** Independent Start Menu surface in the default Shell. */
export default memo(function StartMenu() {

    const control = useStartMenuControl()

    const reducedMotion = useReducedMotion()

    const transaction = useTiming()("change")

    const portrait = usePortrait()

    const scale = useDesktopScale()

    return <motion.div
        ref={control.popover.surface}
        id={control.id}
        role="dialog"
        aria-labelledby={`${control.id}-label`}
        tabIndex={-1}
        className={`${shellSurfaceClassName} pointer-events-auto fixed hidden open:block`}
        style={startMenuStyle(control.taskbar, control.spacing, portrait, scale)}
        {...control.popover.motion}
        transition={surfacePresenceTransition(reducedMotion, transaction)}
        onToggle={event => {

            if (event.newState !== "open") return

            // The search comes first: a Program is usually one it names.
            const focusTarget = event.currentTarget.querySelector<HTMLElement>("input[type=search],button:not(:disabled),a[href]") ?? event.currentTarget

            focusTarget.focus()
        }}
    >

        <StartMenuPanel
            labelId={`${control.id}-label`}
            onChoose={control.popover.close}
        />

    </motion.div>
})

/**
 * The menu occupies the leading corner beside the Taskbar: one spacing from
 * its perpendicular screen edge and two spacings beyond the Taskbar edge. It
 * takes the screen's shape: wide on a wide screen, and the same size turned on
 * a tall one, each within the room the screen has. That room is the visible
 * viewport (`dvh`, which leaves out a phone browser's bars, as the Desktop
 * itself does), in Desktop pixels: the Desktop's zoom multiplies viewport units
 * too, so they are divided by its scale.
 */
export function startMenuStyle(taskbar: AppearanceTaskbar, spacing: number, portrait = false, scale = 1): CSSProperties {
    const [long, short] = ["44rem", "32rem"]
    const [across, down] = portrait ? [short, long] : [long, short]
    const horizontal = taskbar.position === "top" || taskbar.position === "bottom"
    const taskbarInset = taskbar.size + spacing * 2
    const style = {
        position: "fixed",
        // Taskbar positions name physical screen edges. Keep every inset in
        // that same coordinate system: logical starts conflict with top/left
        // and can silently replace their offsets with `auto`.
        top: "auto",
        right: "auto",
        bottom: "auto",
        left: "auto",
        width: horizontal
            ? `min(${across}, calc(100dvw / ${scale} - ${spacing * 2}px))`
            : `min(${across}, calc(100dvw / ${scale} - ${taskbarInset + spacing}px))`,
        height: horizontal
            ? `min(${down}, calc(100dvh / ${scale} - ${taskbarInset + spacing}px))`
            : `min(${down}, calc(100dvh / ${scale} - ${spacing * 2}px))`
    } satisfies CSSProperties

    if (taskbar.position === "bottom") return { ...style, left: spacing, bottom: taskbarInset }

    if (taskbar.position === "top") return { ...style, left: spacing, top: taskbarInset }

    if (taskbar.position === "left") return { ...style, left: taskbarInset, top: spacing }

    return { ...style, right: taskbarInset, top: spacing }
}

function useStartMenuControl() {

    const value = useContext(StartMenuContext)

    if (!value) throw new Error("Start Menu parts require StartMenuProvider")

    return value
}

/** Whether the default Shell's Start Menu currently retains its Taskbar anchor. */
export function useStartMenuOpen() {
    return useStartMenuControl().popover.open
}

interface StartMenuControl {
    id: string
    taskbar: AppearanceTaskbar
    spacing: number
    popover: ReturnType<typeof useShellPopover>
}
