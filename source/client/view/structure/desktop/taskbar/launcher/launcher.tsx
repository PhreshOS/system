import { type ComponentPropsWithoutRef, ReactNode, useCallback, useEffect, useId, useRef, useState } from "react"
import { surfacePresenceTransition } from "@client/view/appearance/surface-presence"
import { cssEasing } from "@client/view/appearance/motion"
import { useReducedMotion } from "@libs/react-motion"
import { motion } from "motion/react"
import { taskbarSurfaceClassName } from "../taskbar-surface"
import TaskbarButton from "../taskbar-button"
import { useAppearance } from "@phreshos/react-ui"

/**
 * A button and the dismissible surface it opens. Placement, contents and
 * what selecting an item means belong to the caller.
 */
export default function ({ label, trigger, children, className, style, ...props }: LauncherProps) {

    const id = useId()

    const surface = useRef<HTMLDivElement>(null)

    const reducedMotion = useReducedMotion()
    const transaction = useAppearance().transaction

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

        // A Program frame is a separate document, so its pointer events cannot
        // participate in this document's native popover light dismissal. The
        // browser does expose the focus crossing at the browsing-context wall:
        // the iframe becomes this document's active element.
        function closeForProgramFrame() {

            if (document.activeElement instanceof HTMLIFrameElement) close()
        }

        window.addEventListener("blur", closeForProgramFrame)

        return () => window.removeEventListener("blur", closeForProgramFrame)

    }, [close])

    return <>

        <TaskbarButton

            type="button"

            aria-controls={id}

            aria-expanded={open}

            aria-haspopup="dialog"

            aria-label={label}

            onPressStart={beginToggle}

            onPress={toggle}

        >

            {trigger}

        </TaskbarButton>

        <motion.div

            {...props}

            ref={surface}

            id={id}

            role="dialog"

            popover="auto"

            aria-labelledby={`${id}-label`}

            tabIndex={-1}

            style={{
                ...style,
                transitionBehavior: "allow-discrete",
                transitionDuration: reducedMotion ? "0ms" : String(transaction.duration) + "ms",
                transitionTimingFunction: cssEasing(transaction.easing),
                transitionProperty: "display, overlay"
            }}

            className={`${taskbarSurfaceClassName} hidden open:block ${className ?? ""}`}

            initial={false}

            animate={open ? { scale: 1, opacity: 1 } : { scale: 1.05, opacity: 0 }}

            transition={surfacePresenceTransition(reducedMotion, transaction)}

            onBeforeToggle={event => {

                setOpen(event.newState === "open")
            }}

            onToggle={event => {

                const opening = event.newState === "open"

                if (opening) {

                    const focusTarget = event.currentTarget.querySelector<HTMLElement>("button:not(:disabled),a[href]") ?? event.currentTarget

                    focusTarget.focus()
                }

            }}

        >

            {children(close, `${id}-label`)}

        </motion.div>

    </>
}

export interface LauncherProps extends Omit<ComponentPropsWithoutRef<"div">, "children" | "id" | "onAnimationStart" | "onBeforeToggle" | "onDrag" | "onDragEnd" | "onDragStart" | "onToggle" | "popover"> {

    label: string

    trigger: ReactNode

    children: (close: () => void, labelId: string) => ReactNode
}
