import { expect, test, vi } from "vitest"
import AuthManager from "@server/core/link-manager/auth-manager/auth-manager"

test("a connection closed while an event is on its way neither fails the event nor stops the others", async () => {
    const closed = { external: true, session: null, link: { $outbound: { publish: vi.fn(async () => { throw new Error("The IPC connection is closed") }) } } }
    const open = { external: false, session: "session", link: { $outbound: { publish: vi.fn(async () => undefined) } } }
    const signedOut = { external: false, session: null, link: { $outbound: { publish: vi.fn(async () => undefined) } } }
    const manager = { linkManager: { boundaries: new Map<string, unknown>([["closed", closed], ["open", open], ["signed-out", signedOut]]) } }
    const broadcast = (AuthManager.prototype as unknown as { broadcastToAuthorizedBoundaries: (event: string, ...values: unknown[]) => Promise<void> }).broadcastToAuthorizedBoundaries

    await expect(broadcast.call(manager, "/program/install", "notes")).resolves.toBeUndefined()

    expect(open.link.$outbound.publish).toHaveBeenCalledWith("/program/install", "notes")
    expect(signedOut.link.$outbound.publish).not.toHaveBeenCalled()
})
