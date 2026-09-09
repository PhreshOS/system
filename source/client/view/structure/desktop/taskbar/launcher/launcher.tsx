import { type ComponentPropsWithoutRef, ReactNode, useCallback, useEffect, useId, useRef, useState } from "react"
import { enterSurface, prepareSurfaceEntrance, restSurface } from "@client/view/appearance/surface-presence"
import { useReducedMotion } from "@libs/react-motion"
import { taskbarSurfaceClassName } from "../taskbar-surface"
import TaskbarButton from "../taskbar-button"

/**
 * A button and the dismissible surface it opens. Placement, contents and
 * what selecting an item means belong to the caller.
 */
export default function ({ label, trigger, children, className, ...props }: LauncherProps) {

    const id = useId()

    const surface = useRef<HTMLDivElement>(null)

    const reducedMotion = useReducedMotion()

    const [open, setOpen] = useState(false)

    const close = useCallback(function () {

        const element = surface.current

        if (element?.matches(":popover-open")) element.hidePopover()

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

            title={label}

            popoverTarget={id}

        >

            {trigger}

        </TaskbarButton>

        <div

            {...props}

            ref={surface}

            id={id}

            role="dialog"

            popover="auto"

            aria-labelledby={`${id}-label`}

            tabIndex={-1}

            className={`${taskbarSurfaceClassName} hidden open:block ${className ?? ""}`}

            onBeforeToggle={event => {

                if (event.newState === "open") prepareSurfaceEntrance(event.currentTarget, reducedMotion)
            }}

            onToggle={event => {

                const opening = event.newState === "open"

                setOpen(opening)

                if (opening) {

                    enterSurface(event.currentTarget, reducedMotion)

                    const focusTarget = event.currentTarget.querySelector<HTMLElement>("button:not(:disabled),a[href]") ?? event.currentTarget

                    focusTarget.focus()
                }

                else restSurface(event.currentTarget)

            }}

        >

            {children(close, `${id}-label`)}

        </div>

    </>
}

export interface LauncherProps extends Omit<ComponentPropsWithoutRef<"div">, "children" | "id" | "onBeforeToggle" | "onToggle" | "popover"> {

    label: string

    trigger: ReactNode

    children: (close: () => void, labelId: string) => ReactNode
}
