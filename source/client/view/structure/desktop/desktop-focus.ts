import Process from "@client/core/link-manager/auth-manager/process-manager/process"
import useWindows from "../../components/window-manager/window-manager"
import { type FocusEvent, type RefObject, useCallback, useRef } from "react"

/** Focus transfer between the workspace, its windows and their taskbar items. */
export default function useDesktopFocus(desktop: RefObject<HTMLDivElement | null>, windows: ReturnType<typeof useWindows>, taskbarOverlay: boolean) {

    const focusedWindow = useRef<string | null>(null)

    const taskbarItems = useRef(new Map<string, HTMLButtonElement>())

    const taskbarOrder = useRef(windows.panesByLayer.window.map(({ record }) => record))

    taskbarOrder.current = windows.panesByLayer.window.map(({ record }) => record)

    const taskbarItem = useCallback(function (record: Process, element: HTMLButtonElement | null) {

        if (element) taskbarItems.current.set(record.identity, element)

        else taskbarItems.current.delete(record.identity)

    }, [])

    const focusTaskbar = useCallback(function (record: Process) {

        focusAfterWindow(desktop.current, taskbarItems.current.get(record.identity), taskbarOverlay)

    }, [desktop, taskbarOverlay])

    const focusAfter = useCallback(function (record: Process) {

        const records = taskbarOrder.current

        const index = records.findIndex(entry => entry.identity === record.identity)

        const candidates = index < 0 ? [] : [...records.slice(index + 1), ...records.slice(0, index).reverse()]

        const target = candidates.map(entry => taskbarItems.current.get(entry.identity)).find(element => element)

        focusAfterWindow(desktop.current, target, taskbarOverlay)

    }, [desktop, taskbarOverlay])

    const remember = useCallback(function (event: FocusEvent<HTMLDivElement>) {

        const element = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-process-window]") : null

        focusedWindow.current = element?.dataset.processWindow ?? null

    }, [])

    // A process may minimize or end itself while its pane owns focus. The
    // representation reports that it is leaving interaction before it hides
    // or completes departure, so focus never remains in an inert subtree.
    const unavailable = useCallback(function (record: Process, reason: "minimize" | "close") {

        if (focusedWindow.current !== record.identity) return

        focusedWindow.current = null

        if (reason === "close") focusAfter(record)

        else focusTaskbar(record)

    }, [focusAfter, focusTaskbar])

    // Focus needs nothing here: a Window minimized from its own header hands focus on once it becomes
    // unavailable, and a press in the Taskbar already holds focus where it belongs.
    const minimize = useCallback(function (record: Process, minimized: boolean) {

        windows.minimize(record, minimized).catch(() => undefined)

    }, [windows.minimize])

    const close = useCallback(function (record: Process) {

        focusAfter(record)

        windows.close(record)

    }, [focusAfter, windows.close])

    return { taskbarItem, remember, unavailable, minimize, close }
}

/**
 * Where focus goes when a Window leaves interaction: its Taskbar item, or the Desktop when the
 * Taskbar hides as an overlay or there is no item. Focus never scrolls the Shell: a focused item of
 * a hidden Taskbar would otherwise be scrolled into view and hold it there.
 */
export function focusAfterWindow(desktop: HTMLDivElement | null, taskbarItem: HTMLButtonElement | undefined, taskbarOverlay: boolean) {
    if (taskbarOverlay || !taskbarItem) {
        desktop?.focus({ preventScroll: true })
        return
    }

    taskbarItem.focus({ preventScroll: true })
}
