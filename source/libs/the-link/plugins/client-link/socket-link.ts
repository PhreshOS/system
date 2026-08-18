import TheLink from "../../the-link"
import Tunnel from "../../tunnel"

/**
 * Client-side WebSocket adapter for a subscribed ServerLink connection.
 *
 * Wraps one browser WebSocket with TheLink-compatible inbound and outbound
 * tunnels. Server messages are routed into the inbound tunnel, while outbound
 * tunnel events are serialized and sent back through the WebSocket.
 *
 * Event messages use a simple `[event, ...values]` envelope.
 *
 * @example
 * ```typescript
 * const socket = await client.subscribeAsync()
 *
 * socket.$inbound.subscribe("server:event", handleServerEvent)
 * await socket.$outbound.publish("client:event", payload)
 * ```
 */
export default class SocketLink<Payload = unknown> extends TheLink {

    /**
     * Internal tunnel for this socket's lifecycle events.
     *
     * Publishes `unsubscribe` when the underlying WebSocket closes.
     */
    public readonly $internal: Tunnel = new Tunnel()

    /**
     * Browser WebSocket used for bidirectional transport.
     */
    private readonly socket: WebSocket

    /**
     * Server response payload supplied during subscription establishment.
     */
    public readonly payload: Payload

    /**
     * Converts outbound values into wire-format strings.
     */
    private serialize = <Input>(input: Input): string => JSON.stringify(input)

    /**
     * Converts wire-format strings back into typed values.
     */
    private deserialize = <Output>(input: string): Output => JSON.parse(input)

    /**
     * Initialize a SocketLink for one browser WebSocket subscription.
     *
     * @param socket Browser WebSocket connected to the server subscription route
     * @param payload Server-provided subscription response payload
     */
    public constructor(socket: WebSocket, payload: Payload) {

        super()

        // Store the raw WebSocket connection for later message delivery.
        this.socket = socket

        // Preserve server-provided connection context for application handlers.
        this.payload = payload

        // Route server messages and close events through local handlers.
        this.socket.addEventListener("message", this.subscribeHandler.bind(this))

        this.socket.addEventListener("close", this.closeHandler.bind(this))

        // Send outbound tunnel events to the server automatically.
        this.$outbound.forwardTo(this.publishHandler.bind(this))
    }

    /**
     * Configure the serialization function used for WebSocket payloads.
     *
     * @param serialize Custom function that converts values to strings
     */
    public setSerialize(serialize: typeof this.serialize<unknown>) {

        this.serialize = serialize as typeof this.serialize
    }

    /**
     * Configure the deserialization function used for WebSocket payloads.
     *
     * @param deserialize Custom function that parses values from strings
     */
    public setDeserialize(deserialize: typeof this.deserialize<unknown>) {

        this.deserialize = deserialize as typeof this.deserialize
    }

    /**
     * Connect another TheLink instance to this socket until it unsubscribes.
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
     * Close the WebSocket subscription from the client side.
     *
     * @param code WebSocket close code
     * @param reason Close reason sent to the server
     */
    public unsubscribe(code: number = 1000, reason: string = "Unsubscribed by client") {

        this.socket.close(code, reason)
    }

    /**
     * Process a server message envelope and route it into the inbound tunnel.
     *
     * @param event Browser WebSocket message event
     */
    private async subscribeHandler(event: MessageEvent) {

        const result = this.deserialize<{ type: string, data: [string, ...unknown[]] }>(event.data)

        if (result.type === "message") {

            // Decode the event payload from the server.
            const [eventName, ...values] = result.data

            try {

                // Publish server event through this socket's inbound tunnel.
                await this.$inbound.publish(eventName, ...values)
            }

            catch (exception) {

                console.error(exception instanceof Error ? exception.message : "An unknown exception occurred")
            }
        }
    }

    /**
     * Send an outbound tunnel event to the server.
     *
     * @param event Event identifier sent to the server
     * @param values Event payload values sent to the server
     */
    private publishHandler(event: string, ...values: unknown[]) {

        // Send the event envelope using the same simple event tuple protocol.
        this.socket.send(this.serialize([event, ...values]))
    }

    /**
     * Publish the socket-level unsubscribe event after WebSocket closure.
     *
     * @param event Browser WebSocket close event
     */
    private async closeHandler(event: CloseEvent) {

        await this.$internal.publish("unsubscribe", event.code, event.reason)
    }
}