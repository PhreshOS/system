import type LinkManager from "@server/core/link-manager/link-manager"
import localServer from "./local-server"
import messagepack from "@the-link/messagepack"
import type { SocketServer } from "@the-link/ipc/socket-server"

/** Open the owner-local IPC adapter for the System Link Manager. */
export default function gateway(linkManager: LinkManager, path: string) {

    return localServer(path, function (server) {

        server.setSerialize(messagepack.serialize)
        server.setDeserialize(messagepack.deserialize)
        server.onConnection(peer => connect(linkManager, peer))
    })
}

async function connect(linkManager: LinkManager, peer: GatewayPeer) {

    const connection = linkManager.addConnection(peer)
    let closed = false
    const close = async () => {

        if (closed) return

        closed = true

        stopForwarding()

        await linkManager.removeConnection(connection)
    }
    const stopForwarding = peer.$inbound.forwardTo((event, ...values: unknown[]) => connection.publish(event, ...values))

    peer.$internal.subscribeOnce("disconnect", close)

    try {

        const session = await linkManager.addSession(connection, true)

        await peer.$outbound.publish("/gateway/ready", session)
    }

    catch (error) {

        await close()
        await peer.disconnect()

        throw error
    }
}

type GatewayPeer = Parameters<Parameters<SocketServer["onConnection"]>[0]>[0]
