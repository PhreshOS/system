import { expect, test } from "vitest"
import { captureLeavingWindow, captureWindowIncarnation } from "@client/view/components/window-manager/window-manager"
import type ClientState from "@client/core/link-manager/auth-manager/process-manager/client-state"
import type Process from "@client/core/link-manager/auth-manager/process-manager/process"

test("a departing presentation retains the layer captured while its Window was live", () => {
    let running = true

    const client = {
        window: {
            get layer() {
                if (!running) throw new Error("This Client Endpoint is not running")

                return "wallpaper" as const
            }
        }
    } as ClientState

    const incarnation = captureWindowIncarnation("process:0", { identity: "process" } as Process, client)

    running = false

    expect(incarnation.layer).toBe("wallpaper")
})

test("an ended Client animates from its captured presentation after the live controller forgets it", () => {
    const client = { window: { layer: "window" } } as ClientState
    const incarnation = captureWindowIncarnation("process:0", { identity: "process" } as Process, client)
    const presented = { layer: "window", position: { x: 20, y: 30 } }
    const live = new Map([[incarnation.identity, presented]])

    const leaving = captureLeavingWindow(incarnation, live as never)

    live.clear()

    expect(leaving?.presentation).toBe(presented)
    expect(live.has(incarnation.identity)).toBe(false)
})
