import { expect, test, vi } from "vitest"
import { focusAfterMinimize } from "@client/view/structure/desktop/desktop-focus"

test("minimizing from a Window does not focus an overlay Taskbar", () => {
    const desktopFocus = vi.fn()
    const taskbarFocus = vi.fn()

    focusAfterMinimize(
        { focus: desktopFocus } as unknown as HTMLDivElement,
        { focus: taskbarFocus } as unknown as HTMLButtonElement,
        true
    )

    expect(desktopFocus).toHaveBeenCalledWith({ preventScroll: true })
    expect(taskbarFocus).not.toHaveBeenCalled()
})

test("minimizing from a Window focuses its visible non-overlay Taskbar item", () => {
    const desktopFocus = vi.fn()
    const taskbarFocus = vi.fn()

    focusAfterMinimize(
        { focus: desktopFocus } as unknown as HTMLDivElement,
        { focus: taskbarFocus } as unknown as HTMLButtonElement,
        false
    )

    expect(desktopFocus).not.toHaveBeenCalled()
    expect(taskbarFocus).toHaveBeenCalledOnce()
})
