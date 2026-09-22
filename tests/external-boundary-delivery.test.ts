import assert from "node:assert/strict"
import { TheLink } from "@the-link/core"
import AuthManager from "@server/core/link-manager/auth-manager/auth-manager"
import type LinkManager from "@server/core/link-manager/link-manager"
import { test } from "vitest"

test("targeted publications reach trusted external boundaries", async () => {

    const sent: unknown[][] = []
    const link = new TheLink()

    link.$outbound.forwardTo((event, ...values) => { sent.push([event, ...values]) })

    const manager = Object.create(AuthManager.prototype) as AuthManager

    Object.defineProperty(manager, "linkManager", {
        value: {
            boundaries: new Map([["external", { external: true, session: null, link }]])
        } as unknown as LinkManager
    })

    await manager.publishToBoundary("external", "/process/followed", "subscription", "changed", { revision: 1 })

    assert.deepEqual(sent, [["/auth/process/followed", "subscription", "changed", { revision: 1 }]])
})
