import { ServerLink } from "@the-link/server"
import { upgradeWebSocket } from "@hono/node-server"
import Application from "@server/core/application"
import messagepack from "@libs/messagepack"
import { failed, succeeded } from "@server/core/outcome"

export default function (application: Application, debugging: boolean) {

    const serverLink = new ServerLink()

    if (debugging) serverLink.enableDebugging()

    serverLink.setSerialize(messagepack.serialize)

    serverLink.setDeserialize(messagepack.deserialize)

    serverLink.onSubscribe(function (socketLink) {

        const connectionIdentity = application.linkManager.addConnection(socketLink)

        const stopForwarding = socketLink.$inbound.forwardTo(async function (event, responseUuid: string | null, ...values: unknown[]) {

            // A null response address is an intentional one-way transport
            // envelope. Route it once and do not manufacture an acknowledgement.
            if (responseUuid === null) {

                const routed = event.startsWith("/auth/process/frame/") ? [values[0], connectionIdentity, ...values.slice(1)] : values

                application.linkManager.$inbound.publish(event, ...routed).catch(() => undefined)

                return
            }

            try {

                // Every client Process-boundary operation is owned by this
                // socket. Insert the connection here, where it comes from the
                // connection itself and cannot be supplied by an iframe.
                const routed = event.startsWith("/auth/process/frame/") ? [values[0], connectionIdentity, ...values.slice(1)] : values

                const results = await application.linkManager.$inbound.publish(event, ...routed)

                await socketLink.$outbound.publish(responseUuid, succeeded(results))
            }

            catch (exception) {

                await socketLink.$outbound.publish(responseUuid, failed(exception, debugging))
            }
        })

        socketLink.$internal.subscribeOnce("unsubscribe", async function () {

            await application.linkManager.removeConnection(connectionIdentity)

            stopForwarding()
        })

        return [application.linkManager, connectionIdentity]
    })

    serverLink.prepareConnection(upgradeWebSocket)

    return serverLink.app
}
