import { failed, succeeded } from "@libs/request-outcome"
import { upgradeWebSocket } from "@hono/node-server"
import Application from "@server/core/application"
import { HttpServer } from "@the-link/http/server"
import messagepack from "@libs/messagepack"

export default function (application: Application, debugging: boolean) {

    const http = new HttpServer()

    if (debugging) http.enableDebugging()

    http.setSerialize(messagepack.serialize)

    http.setDeserialize(messagepack.deserialize)

    http.onSubscribe(function (socketLink) {

        const connection = application.linkManager.addConnection(socketLink)

        const stopForwarding = socketLink.$inbound.forwardTo(async function (event, responseUuid: string | null, ...values: unknown[]) {

            // A null response address is an intentional one-way transport
            // envelope. Route it once and do not manufacture an acknowledgement.
            if (responseUuid === null) {

                connection.publish(event, ...values).catch(() => undefined)

                return
            }

            try {

                const results = await connection.publish(event, ...values)

                await socketLink.$outbound.publish(responseUuid, succeeded(results))
            }

            catch (exception) {

                await socketLink.$outbound.publish(responseUuid, failed(exception, debugging))
            }
        })

        socketLink.$internal.subscribeOnce("unsubscribe", async function () {

            await application.linkManager.removeConnection(connection)

            stopForwarding()
        })

        return application.linkManager
    })

    http.prepareConnection(upgradeWebSocket)

    return http.app
}
