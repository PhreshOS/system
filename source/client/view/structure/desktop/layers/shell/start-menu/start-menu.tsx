import PhreshOSIcon from "@client/view/components/phreshos-icon"
import { createContext, memo, useCallback, useContext, useEffect, useId, useRef, useState, type CSSProperties, type PropsWithChildren, type RefObject } from "react"
import StartMenuPanel from "./start-menu-panel"
import { name } from "@/source/identity"
import { type AppearanceTaskbar } from "@phreshos/core"
import { useReducedMotion } from "@libs/react-motion"
import { motion } from "motion/react"
import { shellSurfaceClassName } from "../shell-surface"
import TaskbarButton from "../taskbar/taskbar-button"
import { useTiming } from "@phreshos/react-ui"
import { cssEasing } from "@phreshos/core"
import { surfaceLifecyclePose, surfacePresenceTransition } from "@client/view/appearance/surface-presence"
import { usePortrait } from "../../../orientation"

const StartMenuContext = createContext<StartMenuControl | null>(null)

/** Shared behavior only; the Taskbar trigger and Shell surface remain siblings. */
export function StartMenuProvider({ taskbar, spacing, children }: PropsWithChildren<{
    taskbar: AppearanceTaskbar
    spacing: number
}>) {

    const id = useId()

    const surface = useRef<HTMLDivElement>(null)

    const [open, setOpen] = useState(false)

    const openAtPressStart = useRef(false)

    const close = useCallback(function () {

        const element = surface.current

        if (element?.matches(":popover-open")) element.hidePopover()

    }, [])

    const beginToggle = useCallback(function () {

        openAtPressStart.current = surface.current?.matches(":popover-open") ?? false

    }, [])

    const toggle = useCallback(function () {

        const element = surface.current

        if (!element) return

        if (openAtPressStart.current) {

            if (element.matches(":popover-open")) element.hidePopover()

            return
        }

        if (!element.matches(":popover-open")) element.showPopover()

    }, [])

    useEffect(function () {

        // Program frames are separate documents, so focus crossing the iframe
        // boundary is the signal that replaces native popover light dismissal.
        function closeForProgramFrame() {

            if (document.activeElement instanceof HTMLIFrameElement && !surface.current?.contains(document.activeElement)) close()
        }

        window.addEventListener("blur", closeForProgramFrame)

        return () => window.removeEventListener("blur", closeForProgramFrame)

    }, [close])

    return <StartMenuContext.Provider value={{ id, surface, taskbar, spacing, open, setOpen, close, beginToggle, toggle }}>

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
        aria-expanded={control.open}
        aria-haspopup="dialog"
        aria-label={name}
        onPressStart={control.beginToggle}
        onPress={control.toggle}
    />
})

/** Independent Start Menu surface in the default Shell. */
export default memo(function StartMenu() {

    const control = useStartMenuControl()

    const reducedMotion = useReducedMotion()

    const transaction = useTiming()("change")

    const portrait = usePortrait()

    return <motion.div
        ref={control.surface}
        id={control.id}
        role="dialog"
        popover="auto"
        aria-labelledby={`${control.id}-label`}
        tabIndex={-1}
        className={`${shellSurfaceClassName} pointer-events-auto fixed hidden open:block`}
        style={{
            ...startMenuStyle(control.taskbar, control.spacing, portrait),
            transitionBehavior: "allow-discrete",
            transitionDuration: reducedMotion ? "0ms" : String(transaction.duration) + "ms",
            transitionTimingFunction: cssEasing(transaction.easing),
            transitionProperty: "display, overlay"
        }}
        initial={false}
        animate={control.open ? surfaceLifecyclePose.visible : surfaceLifecyclePose.hidden}
        transition={surfacePresenceTransition(reducedMotion, transaction)}
        onBeforeToggle={event => control.setOpen(event.newState === "open")}
        onToggle={event => {

            if (event.newState !== "open") return

            // The search comes first: a Program is usually one it names.
            const focusTarget = event.currentTarget.querySelector<HTMLElement>("input[type=search],button:not(:disabled),a[href]") ?? event.currentTarget

            focusTarget.focus()
        }}
    >

        <StartMenuPanel
            labelId={`${control.id}-label`}
            onChoose={control.close}
        />

    </motion.div>
})

/**
 * The menu occupies the leading corner beside the Taskbar: one spacing from
 * its perpendicular screen edge and two spacings beyond the Taskbar edge. It
 * takes the screen's shape: wide on a wide screen, and the same size turned on
 * a tall one, each within the room the screen has.
 */
export function startMenuStyle(taskbar: AppearanceTaskbar, spacing: number, portrait = false): CSSProperties {
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
            ? `min(${across}, calc(100vw - ${spacing * 2}px))`
            : `min(${across}, calc(100vw - ${taskbarInset + spacing}px))`,
        height: horizontal
            ? `min(${down}, calc(100vh - ${taskbarInset + spacing}px))`
            : `min(${down}, calc(100vh - ${spacing * 2}px))`
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
    return useStartMenuControl().open
}

interface StartMenuControl {
    id: string
    surface: RefObject<HTMLDivElement | null>
    taskbar: AppearanceTaskbar
    spacing: number
    open: boolean
    setOpen: (open: boolean) => void
    close: () => void
    beginToggle: () => void
    toggle: () => void
}
