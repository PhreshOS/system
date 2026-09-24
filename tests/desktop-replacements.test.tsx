import { expect, test, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { UIProvider } from "@phreshos/react-ui"
import type Process from "@client/core/link-manager/auth-manager/process-manager/process"
import Workspace from "@client/view/structure/desktop/desktop"
import { windowSurfaceInsets } from "@client/view/structure/desktop/layers/desktop-layers"
import Taskbar, { taskbarConfigurationChanged, taskbarOverlayTransform, taskbarRegionStyle, taskbarRetentionDistance, taskbarRevealRegionStyle, taskbarStyle, taskbarVisible } from "@client/view/structure/desktop/layers/shell/taskbar/taskbar"
import { startMenuStyle } from "@client/view/structure/desktop/layers/shell/start-menu/start-menu"
import { taskbarIndicatorClassName } from "@client/view/structure/desktop/layers/shell/taskbar/programs/taskbar-item"
import { windowMinimizePose } from "@client/view/structure/desktop/windows/window"
import type { ReactNode } from "react"
import { defaultAppearance } from "@phreshos/core"

const fixture = vi.hoisted(() => ({
    processes: new Map<string, Process>(),
    pane: vi.fn(), fallback: vi.fn()
}))

vi.mock("@client/view/contexts", () => ({
    ApplicationContext: { useValue: () => ({ doors: { program: "/program" } }) },
    AuthManagerContext: { useValue: () => ({
        processManager: { processes: fixture.processes },
        programManager: { programs: new Map([
            ["wallpaper-program", { assetId: "wallpaper-assets" }],
            ["shell-program", { assetId: "shell-assets" }]
        ]) }
    }) },
    LinkManagerContext: { useValue: () => ({ appearance: { value: defaultAppearance } }) }
}))
vi.mock("@the-link/react", () => ({
    ReactTunnel: { useFactory: () => ({ useSubscribe() {} }) },
    useProperty: (property: { value: unknown }) => property.value
}))
vi.mock("@client/view/components/desktop-host/client-host", () => ({ default: () => ({}) }))
vi.mock("@client/view/components/program-access", () => ({ default: () => null }))
vi.mock("@libs/readiness", () => ({ useRequirement: () => () => {} }))
vi.mock("@client/view/structure/desktop/layers/shell/default-shell", () => ({
    default: ({ children }: { children: ReactNode }) => <><div data-taskbar>{children}</div><div data-default-start-menu /></>
}))
vi.mock("@client/view/structure/desktop/layers/wallpaper/wallpaper", () => ({
    WallpaperBackground: (props: unknown) => { fixture.fallback(props); return <div data-default-wallpaper /> },
    ReadyWallpaper: () => null
}))
vi.mock("@client/view/structure/desktop/windows/process-window", () => ({
    default: (props: { client: { window: { layer: string } } }) => {
        fixture.pane(props)
        return <iframe title={`${props.client.window.layer} Client`} />
    }
}))

test("Desktop composes five full-bound stacked layers without a layout track", () => {
    fixture.processes.clear()
    const markup = renderToStaticMarkup(<UIProvider preferences={{ theme: "light", animations: true }}><Workspace /></UIProvider>)
    const layers = [...markup.matchAll(/data-desktop-layer="([^"]+)"/g)].map(match => match[1])
    expect(layers).toEqual(["wallpaper", "under", "window", "over", "shell"])

    const display = markup.match(/<div[^>]*data-desktop-layers=""[^>]*>/)?.[0]
    const windowLayer = markup.match(/<div[^>]*data-desktop-layer="window"[^>]*>/)?.[0]
    expect(display).toContain("absolute inset-0")
    expect(display).not.toContain("grid")
    expect(windowLayer).toContain("absolute inset-0")
    const windowSurface = markup.match(/<div[^>]*data-window-surface=""[^>]*>/)?.[0]
    expect(windowSurface).not.toContain("overflow-hidden")
    expect(windowSurface).toContain(`top:${defaultAppearance.spacing}px`)
    expect(windowSurface).toContain(`right:${defaultAppearance.spacing}px`)
    expect(windowSurface).toContain(`bottom:${defaultAppearance.spacing * 2 + defaultAppearance.taskbar.size}px`)
    expect(windowSurface).toContain(`left:${defaultAppearance.spacing}px`)
})

test.each(["top", "right", "bottom", "left"] as const)("standard window surface reserves the %s Taskbar edge", position => {
    const spacing = 12
    const size = 44
    const insets = windowSurfaceInsets(spacing, { position, size, overlay: false })

    expect(insets).toEqual({
        top: position === "top" ? 68 : 12,
        right: position === "right" ? 68 : 12,
        bottom: position === "bottom" ? 68 : 12,
        left: position === "left" ? 68 : 12
    })
})

test.each(["top", "right", "bottom", "left"] as const)("an overlay Taskbar does not reserve the %s standard-window edge", position => {
    expect(windowSurfaceInsets(12, { position, size: 44, overlay: true })).toEqual({
        top: 12,
        right: 12,
        bottom: 12,
        left: 12
    })
})

test.each(["top", "right", "bottom", "left"] as const)("an overlay Taskbar hides beyond and listens at the %s edge", position => {
    const taskbar = { position, size: 44, overlay: true }
    const region = taskbarRegionStyle(taskbar, 12)
    const reveal = taskbarRevealRegionStyle(position, 12)

    expect(region).toMatchObject({ [position]: 0 })
    expect(reveal).toMatchObject({ [position]: 0 })
    expect(position === "top" || position === "bottom" ? region.height : region.width).toBe(56 + taskbarRetentionDistance)
    expect(position === "top" || position === "bottom" ? reveal.height : reveal.width).toBe(12)
    expect(taskbarOverlayTransform(position, true, 12)).toBe("translate(0)")
    expect(taskbarOverlayTransform(position, false, 12)).toContain(position === "top" || position === "bottom" ? "translateY" : "translateX")
})

test("an open anchored Shell surface retains the overlay Taskbar", () => {
    const render = (keepVisible: boolean) => renderToStaticMarkup(<UIProvider preferences={{ theme: "light", animations: true }}>
        <Taskbar
            leading={null}
            trailing={null}
            taskbar={{ position: "bottom", size: 44, overlay: true }}
            spacing={12}
            keepVisible={keepVisible}
        >
            {null}
        </Taskbar>
    </UIProvider>)

    expect(render(true)).toContain("transform:translate(0)")
    expect(render(true)).toContain("data-taskbar-retention-region")
    expect(render(false)).toContain("transform:translateY(calc(100% + 12px))")
    expect(render(false)).not.toContain("data-taskbar-retention-region")
})

test("moving an overlay Taskbar invalidates the reveal from its previous edge", () => {
    const previous = { position: "bottom", overlay: true } as const
    const current = { position: "left", size: 44, overlay: true } as const
    const changed = taskbarConfigurationChanged(previous, current)

    expect(changed).toBe(true)
    expect(taskbarVisible(current, true, false, changed)).toBe(false)
    expect(taskbarVisible(current, true, true, changed)).toBe(true)
})

test.each(["top", "right", "bottom", "left"] as const)("Taskbar occupies its configured %s edge and Start Menu opens inward", position => {
    const spacing = 12
    const size = 44
    const taskbar = { position, size, overlay: false }
    const bar = taskbarStyle(taskbar, spacing)
    const menu = startMenuStyle(taskbar, spacing)

    expect(bar).toMatchObject({ position: "absolute", [position]: spacing })

    if (position === "top" || position === "bottom") expect(bar).toMatchObject({ left: spacing, right: spacing, height: size })
    else expect(bar).toMatchObject({ top: spacing, bottom: spacing, width: size })

    const taskbarInset = size + spacing * 2

    if (position === "top") expect(menu).toMatchObject({ top: taskbarInset, right: "auto", bottom: "auto", left: spacing })
    if (position === "bottom") expect(menu).toMatchObject({ top: "auto", right: "auto", bottom: taskbarInset, left: spacing })
    if (position === "left") expect(menu).toMatchObject({ top: spacing, right: "auto", bottom: "auto", left: taskbarInset })
    if (position === "right") expect(menu).toMatchObject({ top: spacing, right: taskbarInset, bottom: "auto", left: "auto" })

    expect(menu).not.toHaveProperty("insetInlineStart")
    expect(menu).not.toHaveProperty("insetBlockStart")
})

test.each(["top", "right", "bottom", "left"] as const)("active Taskbar indicator stays on the configured %s edge", position => {
    expect(taskbarIndicatorClassName(position)).toContain(`${position}-0`)
})

test.each([
    ["top", { x: 0, y: -28 }],
    ["right", { x: 28, y: 0 }],
    ["bottom", { x: 0, y: 28 }],
    ["left", { x: -28, y: 0 }]
] as const)("standard windows minimize toward the %s Taskbar", (position, offset) => {
    expect(windowMinimizePose(position)).toEqual({ scale: 0.86, ...offset, opacity: 0 })
})

test("Desktop replaces its default wallpaper with the running Client and restores the fallback after stop", () => {
    const render = () => renderToStaticMarkup(<UIProvider preferences={{ theme: "light", animations: true }}><Workspace /></UIProvider>)
    fixture.processes.clear()
    fixture.pane.mockClear()
    fixture.fallback.mockClear()
    expect(render()).toContain("data-default-wallpaper")
    expect(fixture.fallback).toHaveBeenCalledOnce()

    const record = {
        identity: "wallpaper-process", program: "wallpaper-program",
        client: { window: {
            layer: "wallpaper", title: "Internal", position: { x: 200, y: 300 },
            header: false,
            size: { width: 100, height: 100 }, minimized: true, maximized: false, depth: 20
        } }
    } as unknown as Process
    fixture.processes.set(record.identity, record)
    fixture.fallback.mockClear()
    const running = render()
    expect(running).toContain('title="wallpaper Client"')
    expect(running).not.toContain("data-default-wallpaper")
    expect(fixture.fallback).not.toHaveBeenCalled()
    expect(fixture.pane.mock.lastCall?.[0]).toMatchObject({
        layer: "wallpaper", surface: false, minimized: false, maximized: true, entering: false,
        position: { x: 0, y: 0 }, size: { width: "100%", height: "100%" }, depth: 0
    })

    record.client = null
    fixture.pane.mockClear()
    expect(render()).toContain("data-default-wallpaper")
    expect(fixture.pane).not.toHaveBeenCalled()
    expect(fixture.fallback).toHaveBeenCalledOnce()
})

test("Desktop replaces the complete built-in Shell and restores it after stop", () => {
    const render = () => renderToStaticMarkup(<UIProvider preferences={{ theme: "light", animations: true }}><Workspace /></UIProvider>)
    fixture.processes.clear()
    fixture.pane.mockClear()
    expect(render()).toContain("data-default-start-menu")
    expect(render()).toContain("data-taskbar")

    const record = {
        identity: "shell-process", program: "shell-program",
        client: { window: {
            layer: "shell", title: "Internal", position: { x: 200, y: 300 },
            header: false,
            size: { width: 100, height: 100 }, minimized: true, maximized: false, depth: 20
        } }
    } as unknown as Process
    fixture.processes.set(record.identity, record)
    fixture.pane.mockClear()
    const running = render()
    expect(running).toContain('title="shell Client"')
    expect(running).not.toContain("data-default-start-menu")
    expect(running).not.toContain("data-taskbar")
    expect(fixture.pane.mock.lastCall?.[0]).toMatchObject({
        layer: "shell", surface: false, minimized: false, maximized: false, entering: false,
        position: { x: 0, y: 0 }, size: { width: 0, height: 0 }, depth: 20
    })

    record.client = null
    fixture.pane.mockClear()
    expect(render()).toContain("data-default-start-menu")
    expect(fixture.pane).not.toHaveBeenCalled()
})
