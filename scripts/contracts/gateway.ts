import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { resolve } from "node:path"
import { SocketClient } from "@the-link/ipc/socket-client"
import messagepack from "@the-link/messagepack"
import gatewayAddress from "@server/view/gateway/address"
import gateway from "@server/view/gateway/gateway"
import type LinkManager from "@server/core/link-manager/link-manager"

const directory = await mkdtemp(resolve(".verify-gateway-"))
const path = gatewayAddress(directory)
const received: unknown[][] = []
let removed = false
const session = {
    authorization: "owner",
    linkManager: { appearance: { key: "appearance", value: {} } },
    authManager: {
        programManager: { programs: [] },
        processManager: { processes: [] }
    }
}
const linkManager = {
    addConnection() {
        return {
            async publish(event: string, ...values: unknown[]) {
                received.push([event, ...values])
                return [{ event, values }]
            }
        }
    },
    async addSession(_connection: unknown, owner: boolean) {
        assert.equal(owner, true)
        return session
    },
    async removeConnection() { removed = true }
}
const listener = await gateway(linkManager as unknown as LinkManager, path)
const client = new SocketClient(path)

client.setSerialize(messagepack.serialize)
client.setDeserialize(messagepack.deserialize)

const ready = client.$inbound.waitFirst("/gateway/ready")

try {
    await client.connect()

    assert.deepEqual(await ready, session)
    assert.deepEqual(
        await client.$outbound.publishFirst("/auth/example", "authorization", { binary: new Uint8Array([1, 2, 3]) }),
        { event: "/auth/example", values: ["authorization", { binary: new Uint8Array([1, 2, 3]) }] }
    )
    assert.deepEqual(received, [["/auth/example", "authorization", { binary: new Uint8Array([1, 2, 3]) }]])
} finally {
    await client.disconnect()
    await listener.close()
    await rm(directory, { recursive: true, force: true })
}

assert.equal(removed, true)

console.log("gateway boundary verified")
