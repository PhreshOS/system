import TheLink from "../../the-link"
import { defaultSerialize } from "../../codec"
import type { Serialize } from "../../codec"
import { WSContext } from "hono/ws"
import Tunnel from "../../tunnel"

/**
 * Per-connection WebSocket adapter for TheLink server subscriptions.
 *
 * Wraps a single accepted WebSocket connection with TheLink-compatible inbound
 * and outbound tunnels. Server code can use each SocketLink to publish events to
 * one client and receive events from that client.
 *
 * Outbound events are serialized into `{ type: "message", data: [...] }`
 * envelopes using a simple `[event, ...values]` event tuple.
 *
 * @example
 * ```typescript
 * server.onSubscribe((socket) => {
 *     socket.autoJoin(server)
 *     socket.$inbound.subscribe("client:event", handleClientEvent)
 * })
 * ```
 */
export default class SocketLink<Payload = unknown> extends TheLink {

    /**
     * Internal tunnel for this socket's lifecycle events.
     *
     * Currently used to coordinate cleanup when the socket unsubscribes.
     */
    public readonly $internal: Tunnel = new Tunnel()

    /**
     * Accepted WebSocket connection used for bidirectional transport.
     */
    private readonly socket: WSContext

    /**
     * Client payload supplied during subscription establishment.
     */
    public readonly payload: Payload

    private serialize: Serialize = defaultSerialize

    /**
     * Initialize a SocketLink for one accepted WebSocket connection.
     *
     * The constructor stores the connection payload and forwards all outbound
     * tunnel events to the WebSocket publish handler.
     *
     * @param socket Accepted WebSocket context
     * @param payload Client payload supplied during subscription
     */
    public constructor(socket: WSContext, payload: Payload) {

        super()

        // Store the raw WebSocket connection for later message delivery.
        this.socket = socket

        // Preserve caller-provided connection context for application handlers.
        this.payload = payload

        // Send outbound tunnel events to this client automatically.
        this.$outbound.forwardTo(this.publishHandler.bind(this))
    }

    /**
     * Configure the serialization function used for WebSocket payloads.
     *
     * @param serialize Custom function that converts values to bytes
     */
    public setSerialize(serialize: Serialize) {

        this.serialize = serialize
    }

    /**
     * Connect another TheLink instance to this socket until it unsubscribes.
     *
     * Creates a forwarding relationship from the source link to this socket, then
     * registers cleanup on this socket's internal `unsubscribe` event.
     *
     * @param theLink Source link whose events should be forwarded
     * @param fromPrefix Source event prefix to match
     * @param toPrefix Destination event prefix to apply
     * @returns Function that manually disconnects forwarding and cleanup
     */
    public autoJoin(theLink: TheLink, fromPrefix: string = "", toPrefix: string = "") {

        // Forward matching events from the source link to this socket.
        const disconnect = theLink.connectTo(this, fromPrefix, toPrefix)

        // Stop forwarding automatically when the socket closes.
        const removeUnsubscribeSubscriber = this.$internal.subscribeOnce("unsubscribe", disconnect)

        return function () {

            // Allow callers to tear down forwarding before socket closure.
            disconnect()

            removeUnsubscribeSubscriber()
        }
    }

    /**
     * Close the WebSocket subscription from the server side.
     *
     * @param code WebSocket close code
     * @param reason Close reason sent to the client
     */
    public unsubscribe(code: number = 1000, reason: string = "Unsubscribed by server") {

        this.socket.close(code, reason)
    }

    /**
     * Send an outbound tunnel event to the client.
     *
     * @param event Event identifier sent to the client
     * @param values Event payload values sent to the client
     */
    private publishHandler(event: string, ...values: unknown[]) {

        // Send the event envelope using the same simple event tuple protocol.
        this.socket.send(this.serialize({ type: "message", data: [event, ...values] }))
    }
}
