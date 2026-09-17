import { expect, test, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { UIProvider } from "@phreshos/react-ui"
import type Process from "@client/core/link-manager/auth-manager/process-manager/process"
import Workspace from "@client/view/structure/desktop/desktop"
import type { ReactNode } from "react"
import { defaultAppearance } from "@phreshos/core"

const fixture = vi.hoisted(() => ({
    processes: new Map<string, Process>(),
    pane: vi.fn(), fallback: vi.fn(), startMenu: vi.fn()
}))

vi.mock("@client/view/contexts", () => ({
    ApplicationContext: { useValue: () => ({ doors: { program: "/program" } }) },
    AuthManagerContext: { useValue: () => ({
        processManager: { processes: fixture.processes },
        programManager: { programs: new Map([
            ["wallpaper-program", { assetId: "wallpaper-assets" }],
            ["start-menu-program", { assetId: "start-menu-assets" }]
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
vi.mock("@client/view/structure/desktop/taskbar/taskbar", () => ({
    default: ({ leading }: { leading: ReactNode }) => <div data-taskbar>{leading}</div>
}))
vi.mock("@client/view/structure/desktop/taskbar/launcher/start-menu", () => ({
    default: ({ replacement }: { replacement?: ReactNode }) => {
        fixture.startMenu(replacement)
        return <div data-start-menu>{replacement ?? <div data-default-start-menu />}</div>
    }
}))
vi.mock("@client/view/structure/desktop/wallpaper/wallpaper", () => ({
    WallpaperBackground: (props: unknown) => { fixture.fallback(props); return <div data-default-wallpaper /> },
    ReadyWallpaper: () => null
}))
vi.mock("@client/view/structure/desktop/windows/process-window", () => ({
    default: (props: { client: { window: { layer: string } } }) => {
        fixture.pane(props)
        return <iframe title={`${props.client.window.layer} Client`} />
    }
}))

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
        bare: true, minimized: false, maximized: true, entering: false, localSurface: null,
        position: { x: 0, y: 0 }, size: { width: "100%", height: "100%" }, depth: 0
    })

    record.client = null
    fixture.pane.mockClear()
    expect(render()).toContain("data-default-wallpaper")
    expect(fixture.pane).not.toHaveBeenCalled()
    expect(fixture.fallback).toHaveBeenCalledOnce()
})

test("Desktop replaces the built-in Start Menu in its existing host and restores the fallback after stop", () => {
    const render = () => renderToStaticMarkup(<UIProvider preferences={{ theme: "light", animations: true }}><Workspace /></UIProvider>)
    fixture.processes.clear()
    fixture.pane.mockClear()
    fixture.startMenu.mockClear()
    expect(render()).toContain("data-default-start-menu")

    const record = {
        identity: "start-menu-process", program: "start-menu-program",
        client: { window: {
            layer: "start-menu", title: "Internal", position: { x: 200, y: 300 },
            size: { width: 100, height: 100 }, minimized: true, maximized: false, depth: 20
        } }
    } as unknown as Process
    fixture.processes.set(record.identity, record)
    fixture.pane.mockClear()
    const running = render()
    expect(running).toContain('title="start-menu Client"')
    expect(running).not.toContain("data-default-start-menu")
    expect(fixture.pane.mock.lastCall?.[0]).toMatchObject({
        bare: true, minimized: false, maximized: true, entering: false, localSurface: null,
        position: { x: 0, y: 0 }, size: { width: "100%", height: "100%" }, depth: 0
    })

    record.client = null
    fixture.pane.mockClear()
    expect(render()).toContain("data-default-start-menu")
    expect(fixture.pane).not.toHaveBeenCalled()
})
