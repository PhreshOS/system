import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { defaultAppearance, type DesktopPreferences } from "@phreshos/core"
import { TheLink } from "@the-link/core"
import ClientLinkManager from "@client/core/link-manager/link-manager"
import Application from "@server/core/application"
import { test } from "vitest"

test("an RPC result returns only to its requesting boundary", async () => {

    const home = await mkdtemp(join(tmpdir(), "phreshos-request-routing-"))
    const application = await Application.initialize("phreshos", "PhreshOS", "test", home, join(home, "icon.png"))
    const link = new TheLink()
    const boundary = application.linkManager.addExternalConnection(link)
    const broadcasts: unknown[][] = []
    const stop = link.$outbound.forwardTo((event, ...values) => { broadcasts.push([event, ...values]) })

    try {
        assert.deepEqual(await boundary.publish("/auth/authentication/connections"), [[]])
        assert.equal(broadcasts.length, 0)

        const identity = "request-routing"
        const storage = join(home, "request-routing-storage")
        assert.deepEqual(await boundary.publish("/auth/program/create-program", {
            identity,
            storage,
            client: { location: "https://example.test" }
        }), [identity])
        assert(broadcasts.some(([event]) => event === "/auth/program/create"))
        assert(!broadcasts.some(([event]) => event === "/auth/program/create-program"))

        const program = application.linkManager.authManager.programManager.reach(identity)
        assert(program)
        broadcasts.length = 0

        const [process] = await boundary.publish("/auth/program/create-process", {
            identity: program.identity,
            reference: program.reference
        }, {})

        assert.equal(typeof process, "string")
        assert(broadcasts.some(([event]) => event === "/auth/process/created"))
        assert(!broadcasts.some(([event]) => event === "/auth/program/create-process"))
    }
    finally {
        stop()
        await application.linkManager.removeConnection(boundary)
        await application.store.disconnect()
        await rm(home, { recursive: true, force: true })
    }
})

test("Desktop preferences remain inside their owning browser Desktop", async () => {

    const source = new TheLink()
    const outbound: unknown[][] = []
    const preferences: DesktopPreferences = { theme: "light", animations: true, scale: 1 }
    const changed: DesktopPreferences[] = []
    const stopOutbound = source.$outbound.forwardTo((event, ...values) => { outbound.push([event, ...values]) })
    const manager = new ClientLinkManager(
        {} as never,
        source,
        { appearance: { key: "appearance", value: defaultAppearance } },
        preferences
    )
    const stopChanged = manager.desktopPreferences.tunnel.subscribe("change", value => { changed.push(value as DesktopPreferences) })
    const next: DesktopPreferences = { ...preferences, theme: "dark" }

    try {
        await manager.updateDesktopPreferences(next)
        await manager.updateDesktopPreferences(next)

        assert.deepEqual(manager.desktopPreferences.value, next)
        assert.deepEqual(changed, [next])
        assert.deepEqual(outbound, [])
    }
    finally {
        stopChanged()
        stopOutbound()
    }
})
