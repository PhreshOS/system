import assert from "node:assert/strict"
import messagepack from "@the-link/messagepack"
import ClientProcessBoundary from "@client/view/components/desktop-host/client-process-boundary"
import type AuthManager from "@client/core/link-manager/auth-manager/auth-manager"
import type ClientTraffic from "@client/view/components/desktop-host/client-traffic"
import type { WindowPresentationHost } from "@client/view/components/desktop-host/window-presentation"
import { test, vi } from "vitest"

test("a Client question expectation survives initial iframe ownership", async () => {

    const sent: unknown[][] = []
    const element = {
        contentWindow: {
            postMessage(message: unknown[]) {

                sent.push(messagepack.deserialize(message[0] as Uint8Array) as unknown[])
            }
        }
    } as unknown as HTMLIFrameElement
    const authManager = {
        processManager: {
            async ownFrame() {},
            async releaseFrame() {}
        }
    } as unknown as AuthManager
    const boundary = new ClientProcessBoundary(
        "process",
        element,
        authManager,
        () => ({ size: { width: 800, height: 600 } }),
        {} as ClientTraffic,
        { begin() {} } as unknown as WindowPresentationHost
    )
    const question = "client:process:question"

    boundary.receive(["boundary", "expect", question])

    await boundary.own("document")
    await boundary.deliver("end-end", "answer", question, "public-question", "read", { success: true, result: 4 })

    assert.deepEqual(sent, [["end-end", "answer", question, "public-question", "read", { success: true, result: 4 }]])
})

test("a later Client request cannot overtake its Service subscription registration", async () => {

    let completeFollow!: () => void
    const following = new Promise<void>(resolve => { completeFollow = resolve })
    const order: string[] = []
    const processManager = {
        processes: new Map([["process", { program: "flambo" }]]),
        async ownFrame() {},
        async releaseFrame() {},
        async followService() {
            order.push("follow:start")
            await following
            order.push("follow:end")
        },
        async askService() { order.push("ask") }
    }
    const authManager = {
        programManager: { programs: new Map([["flambo", { identity: "flambo", permissions: { services: [] } }]]) },
        processManager,
    } as unknown as AuthManager
    const boundary = new ClientProcessBoundary(
        "process",
        { contentWindow: null } as unknown as HTMLIFrameElement,
        authManager,
        () => ({ size: { width: 800, height: 600 } }),
        {} as ClientTraffic,
        { begin() {} } as unknown as WindowPresentationHost
    )
    const address = { program: "flambo", process: "browser-server", endpoint: "server" } as const

    await boundary.own("document")
    boundary.receive(["end-host", "service-follow", "subscription", address, "events", "workspace.change", false])
    boundary.receive(["end-host", "service-ask", address, "question", "public-question", "workspace.attach", {}])

    await vi.waitFor(() => assert.deepEqual(order, ["follow:start"]))
    completeFollow()
    await vi.waitFor(() => assert.deepEqual(order, ["follow:start", "follow:end", "ask"]))
})

test("a registered Service event is delivered without a second permission round-trip", async () => {

    const sent: unknown[][] = []
    let followed = false
    const address = { program: "browser", process: "browser", endpoint: "server" } as const
    const processManager = {
        processes: new Map([["process", { program: "browser" }]]),
        async ownFrame() {},
        async releaseFrame() {},
        async followService() { followed = true }
    }
    const authManager = {
        programManager: { programs: new Map([["browser", { identity: "browser", permissions: { services: [] } }]]) },
        processManager,
    } as unknown as AuthManager
    const traffic = {
        observe() { return () => undefined }
    } as unknown as ClientTraffic
    const element = {
        contentWindow: {
            postMessage(message: unknown[]) {
                sent.push(messagepack.deserialize(message[0] as Uint8Array) as unknown[])
            }
        }
    } as unknown as HTMLIFrameElement
    const boundary = new ClientProcessBoundary(
        "process",
        element,
        authManager,
        () => ({ size: { width: 800, height: 600 } }),
        traffic,
        { begin() {} } as unknown as WindowPresentationHost
    )

    await boundary.own("document")
    boundary.receive(["boundary", "subscribe", "wire-subscription", "publish", "service-event", "service-subscription", null, false])
    boundary.receive(["end-host", "service-follow", "service-subscription", address, "events", "workspace.changed", false])
    await vi.waitFor(() => assert.equal(followed, true))

    await boundary.deliver("service-event", "service-subscription", { revision: 1 })

    assert.deepEqual(sent, [["service-event", "service-subscription", { revision: 1 }]])
})
