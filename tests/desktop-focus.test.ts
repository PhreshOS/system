import { expect, test, vi } from "vitest"
import { focusAfterWindow } from "@client/view/structure/desktop/desktop-focus"

test("a Window leaving interaction does not focus an overlay Taskbar", () => {
    const desktopFocus = vi.fn()
    const taskbarFocus = vi.fn()

    focusAfterWindow(
        { focus: desktopFocus } as unknown as HTMLDivElement,
        { focus: taskbarFocus } as unknown as HTMLButtonElement,
        true
    )

    expect(desktopFocus).toHaveBeenCalledWith({ preventScroll: true })
    expect(taskbarFocus).not.toHaveBeenCalled()
})

test("a Window leaving interaction focuses a visible Taskbar item without scrolling", () => {
    const desktopFocus = vi.fn()
    const taskbarFocus = vi.fn()

    focusAfterWindow(
        { focus: desktopFocus } as unknown as HTMLDivElement,
        { focus: taskbarFocus } as unknown as HTMLButtonElement,
        false
    )

    expect(desktopFocus).not.toHaveBeenCalled()
    expect(taskbarFocus).toHaveBeenCalledWith({ preventScroll: true })
})

test("with no Taskbar item left, focus goes to the Desktop", () => {
    const desktopFocus = vi.fn()

    focusAfterWindow({ focus: desktopFocus } as unknown as HTMLDivElement, undefined, false)

    expect(desktopFocus).toHaveBeenCalledWith({ preventScroll: true })
})
