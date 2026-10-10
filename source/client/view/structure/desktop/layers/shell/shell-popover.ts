import { useCallback, useEffect, useRef, useState } from "react"
import { useReducedMotion } from "@libs/react-motion"
import { surfaceLifecyclePose } from "@client/view/appearance/surface-presence"
import { useDrawn } from "../../drawn"

/**
 * A Shell surface opened from its Taskbar button, such as the Start Menu or the map: a popover, so
 * it stands above every Window. Pressing anything else, Escape, or focus crossing into a Program
 * frame closes it, and the press goes on to what it was meant for.
 *
 * The Desktop hides it itself, once its leaving motion ends: a browser closing a popover hides it at
 * once, and Safari keeps nothing of it on the screen while it leaves. So the popover is manual, and
 * dismissing it is the Desktop's. Its button names it with `aria-controls` and toggles it.
 */
export function useShellPopover(onOpenChange?: (open: boolean) => void) {

    const surface = useRef<HTMLDivElement>(null)
    const [open, setOpenState] = useState(false)
    const reducedMotion = useReducedMotion()
    const shown = useDrawn(open, { immediate: reducedMotion })
    const current = useRef({ open, shown, reducedMotion, onOpenChange })

    current.current = { open, shown, reducedMotion, onOpenChange }

    const setOpen = useCallback(function (next: boolean) {

        if (current.current.open === next) return

        current.current.open = next
        setOpenState(next)
        current.current.onOpenChange?.(next)
    }, [])

    // Hides it once nothing is left to see: closed, and its leaving motion over or never begun.
    const hide = useCallback(function () {

        const element = surface.current

        if (!current.current.open && element?.matches(":popover-open")) element.hidePopover()
    }, [])

    const show = useCallback(function () {

        const element = surface.current

        if (!element) return

        if (!element.matches(":popover-open")) element.showPopover()

        setOpen(true)
    }, [setOpen])

    const close = useCallback(function () {

        if (!current.current.open) return

        setOpen(false)

        // Not yet entered, or without motion, it has no leaving to wait for.
        if (!current.current.shown || current.current.reducedMotion) hide()
    }, [setOpen, hide])

    const toggle = useCallback(function () {

        if (current.current.open) close()
        else show()
    }, [close, show])

    useEffect(function () {

        if (!open) return

        function press(event: PointerEvent) {

            const target = event.target instanceof Element ? event.target : null
            const element = surface.current

            if (!target || !element || element.contains(target)) return

            // Its own button toggles it.
            if (element.id && target.closest(`[aria-controls="${CSS.escape(element.id)}"]`)) return

            close()
        }

        function key(event: KeyboardEvent) {

            // Something inside that answers Escape itself, such as an open menu, keeps it open.
            if (event.key === "Escape" && !event.defaultPrevented) close()
        }

        // Program frames are separate documents: focus crossing into one is the press there.
        function blur() {

            if (document.activeElement instanceof HTMLIFrameElement && !surface.current?.contains(document.activeElement)) close()
        }

        document.addEventListener("pointerdown", press, true)
        document.addEventListener("keydown", key)
        window.addEventListener("blur", blur)

        return function () {

            document.removeEventListener("pointerdown", press, true)
            document.removeEventListener("keydown", key)
            window.removeEventListener("blur", blur)
        }

    }, [open, close])

    return {
        surface,
        open,
        show,
        close,
        toggle,
        /** Spread on the surface's `motion` element, with its own transition. */
        motion: {
            popover: "manual" as const,
            initial: false as const,
            animate: shown ? surfaceLifecyclePose.visible : surfaceLifecyclePose.hidden,
            onAnimationComplete: hide
        }
    }
}
