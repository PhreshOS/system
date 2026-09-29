import { useCallback, useEffect, useRef } from "react"

/**
 * How long something dragged must stay over a Desktop target before the target shows what it
 * holds. It is React Aria's own delay, so holding a drag opens things the same way inside Programs.
 */
const holdDelay = 800

/**
 * Browsers repeat `dragover` while a drag stays over an element, still or not, at least every
 * 550 ms. A longer silence means the drag left or ended where the Desktop cannot see it, such as
 * inside a Program, and the hold is dropped.
 */
const silence = 1_000

/**
 * A hold of a drag over one Desktop element: once the drag has stayed there long enough, `onHold`
 * runs. It shows or brings forward what the element stands for, the way a press would, and never
 * anything a press would undo or end. Moving away, dropping, or the drag ending cancels it.
 *
 * Returns a callback ref for the element.
 */
export default function useDragHold(onHold: () => void) {

    const latest = useRef(onHold)

    useEffect(() => { latest.current = onHold }, [onHold])

    const timers = useRef<{ hold?: ReturnType<typeof setTimeout>, gone?: ReturnType<typeof setTimeout> }>({})

    const cancel = useCallback(function () {

        clearTimeout(timers.current.hold)
        clearTimeout(timers.current.gone)
        timers.current = {}

    }, [])

    const detach = useRef<(() => void) | null>(null)

    useEffect(() => () => { detach.current?.(); cancel() }, [cancel])

    return useCallback(function (element: Element | null) {

        detach.current?.()
        detach.current = null
        cancel()

        if (!element) return

        const over = () => {

            timers.current.hold ??= setTimeout(() => { cancel(); latest.current() }, holdDelay)
            clearTimeout(timers.current.gone)
            timers.current.gone = setTimeout(cancel, silence)
        }

        // Moving onto a part of the element is still over it.
        const leave = (event: Event) => {

            const next = (event as DragEvent).relatedTarget

            if (!(next instanceof Node && element.contains(next))) cancel()
        }

        element.addEventListener("dragover", over)
        element.addEventListener("dragleave", leave)
        element.addEventListener("drop", cancel)

        detach.current = () => {

            element.removeEventListener("dragover", over)
            element.removeEventListener("dragleave", leave)
            element.removeEventListener("drop", cancel)
        }

    }, [cancel])
}
