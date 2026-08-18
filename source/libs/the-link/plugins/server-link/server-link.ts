import { UpgradeWebSocket, WSContext, WSEvents } from "hono/ws"
import Tunnel, { Subscriber } from "../../tunnel"
import { HonoOptions } from "hono/hono-base"
import SocketLink from "./socket-link"
import { BlankEnv } from "hono/types"
import TheLink from "../../the-link"
import { Hono, Context } from "hono"
import { v4 as uuidv4 } from "uuid"

/**
 * Hono server adapter for TheLink over HTTP and WebSocket endpoints.
 *
 * Provides a POST `/publish` endpoint for client-to-server events and an
 * optional WebSocket `/subscribe` endpoint for long-lived server-to-client
 * communication. Each accepted WebSocket connection gets a dedicated
 * SocketLink instance, allowing application code to route events per client.
 *
 * The adapter uses JSON serialization by default, with hooks for custom
 * serialization layers such as compression, encryption, or type-preserving
 * codecs.
 *
 * Connection lifecycle events:
 * - `subscribe`: Published on the internal tunnel when a socket connects
 * - `unsubscribe`: Published through the SocketLink when a socket closes
 *
 * @example
 * ```typescript
 * const server = new ServerLink()
 *
 * server.prepareConnection(upgradeWebSocket)
 *
 * server.onSubscribe((socket) => {
 *     socket.autoJoin(server)
 * })
 * ```
 */
export default class ServerLink extends TheLink {

    /**
     * Internal tunnel for server-only lifecycle events.
     *
     * Keeps connection coordination separate from application inbound and
     * outbound event traffic.
     */
    public readonly $internal: Tunnel = new Tunnel()

    /**
     * Hono application that owns the HTTP and WebSocket routes.
     */
    public readonly app: Hono

    /**
     * Controls whether handler errors are exposed to clients.
     *
     * Keep disabled in production to avoid leaking internal details.
     */
    private debugging: boolean = false

    /**
     * Converts outbound values into wire-format strings.
     */
    private serialize = <Input>(input: Input): string => JSON.stringify(input)

    /**
     * Converts wire-format strings back into typed values.
     */
    private deserialize = <Output>(input: string): Output => JSON.parse(input)

    /**
     * Active WebSocket-backed SocketLink instances keyed by connection UUID.
     */
    public readonly sockets: Map<string, SocketLink> = new Map()

    /**
     * Initialize a ServerLink with an optional Hono configuration object.
     *
     * @param options Hono application options passed to the underlying app
     */
    public constructor(options?: HonoOptions<BlankEnv>) {

        super()

        this.app = new Hono(options)
    }

    /**
     * Register server communication routes on the Hono application.
     *
     * Always registers the POST `/publish` endpoint. When an Hono WebSocket
     * upgrader is provided, also registers GET `/subscribe` for WebSocket
     * subscriptions.
     *
     * @param upgradeWebSocket Optional Hono WebSocket upgrade helper
     */
    public prepareConnection(upgradeWebSocket?: UpgradeWebSocket) {

        // Configure client-to-server event publication.
        this.app.post("/publish", this.publishHandler.bind(this))

        if (upgradeWebSocket) {

            // Configure long-lived client subscriptions when WebSocket support is available.
            this.app.get("/subscribe", upgradeWebSocket(this.webSocketHandler.bind(this)))
        }
    }

    /**
     * Enable detailed client-facing error messages.
     */
    public enableDebugging() {

        this.debugging = true
    }

    /**
     * Disable detailed client-facing error messages.
     */
    public disableDebugging() {

        this.debugging = false
    }

    /**
     * Configure the serialization function used for HTTP and WebSocket payloads.
     *
     * @param serialize Custom function that converts values to strings
     */
    public setSerialize(serialize: typeof this.serialize<unknown>) {

        this.serialize = serialize as typeof this.serialize
    }

    /**
     * Configure the deserialization function used for HTTP and WebSocket payloads.
     *
     * @param deserialize Custom function that parses values from strings
     */
    public setDeserialize(deserialize: typeof this.deserialize<unknown>) {

        this.deserialize = deserialize as typeof this.deserialize
    }

    /**
     * Register a handler for accepted WebSocket subscriptions.
     *
     * The subscriber receives the SocketLink created for the connection and can
     * attach handlers, join tunnels, or return connection initialization data.
     *
     * @param subscriber Handler invoked with each new SocketLink
     * @returns Function that removes this subscriber
     */
    public onSubscribe<Payload>(subscriber: Subscriber<[SocketLink<Payload>]>) {

        return this.$internal.subscribe("subscribe", subscriber)
    }

    /**
     * Process a client POST request and publish it through the inbound tunnel.
     *
     * @param context Hono request context containing serialized event data
     * @returns Serialized event handler results, or a 500 error response
     */
    private async publishHandler(context: Context) {

        try {

            // Decode the event envelope from the request body.
            const [event, ...values] = this.deserialize<[string, ...unknown[]]>(await context.req.text())

            // Route the client event into the server-side inbound tunnel.
            const results = await this.$inbound.publish(event, ...values)

            return context.text(this.serialize(results))
        }

        catch (exception) {

            console.error(exception instanceof Error ? exception.message : "An unknown exception occurred")

            if (this.debugging) return context.text(exception instanceof Error ? exception.message : "An unknown exception occurred", 500)

            else return context.text("An unknown exception occurred", 500)
        }
    }

    /**
     * Create the Hono WebSocket event handlers for a new subscription request.
     *
     * @param context Hono request context containing subscription query data
     * @returns WebSocket lifecycle callbacks for this connection
     */
    private webSocketHandler(context: Context): WSEvents {

        const uuid = uuidv4()

        return {

            onOpen: (_event, socket) => this.webSocketOpenHandler(context, socket, uuid),

            onMessage: (event) => this.webSocketMessageHandler(event, uuid),

            onClose: (event) => this.webSocketCloseHandler(event, uuid)
        }
    }

    /**
     * Accept a WebSocket connection and create its SocketLink facade.
     *
     * Reads the serialized `payload` query parameter, initializes a SocketLink,
     * publishes the internal subscribe event, and sends the subscription response
     * back to the client.
     *
     * @param context Hono request context containing subscription payload data
     * @param socket Accepted WebSocket context
     * @param uuid Connection identifier used for socket tracking
     */
    private async webSocketOpenHandler(context: Context, socket: WSContext, uuid: string) {

        try {

            // Extract client-provided connection context.
            const payload = context.req.query("payload")

            if (payload === undefined) throw new Error("payload is required")

            const parsedPayload = this.deserialize<{ current: unknown }>(payload)

            // Wrap the raw WebSocket in TheLink-compatible socket routing.
            const socketLink = new SocketLink(socket, parsedPayload.current)

            socketLink.setSerialize(value => this.serialize(value))

            socketLink.setDeserialize(value => this.deserialize(value))

            // Let application code initialize the connection before notifying the client.
            const response = await this.$internal.publishFirst("subscribe", socketLink)

            this.sockets.set(uuid, socketLink)

            socket.send(this.serialize({ type: "subscribe", data: response }))
        }

        catch (exception) {

            console.error(exception instanceof Error ? exception.message : "An unknown exception occurred")

            if (this.debugging) return socket.close(1011, exception instanceof Error ? exception.message : "An unknown exception occurred")

            else return socket.close(1011, "An unknown exception occurred")
        }
    }

    /**
     * Route a WebSocket message through the matching SocketLink inbound tunnel.
     *
     * @param event WebSocket message containing a serialized event envelope
     * @param uuid Connection identifier used to find the SocketLink
     */
    private async webSocketMessageHandler(event: MessageEvent, uuid: string) {

        const socketLink = this.sockets.get(uuid)

        if (socketLink) {

            // Decode the event payload from the message.
            const [eventName, ...values] = this.deserialize<[string, ...unknown[]]>(event.data)

            try {

                // Publish client event through this socket's inbound tunnel.
                await socketLink.$inbound.publish(eventName, ...values)
            }

            catch (exception) {

                console.error(exception instanceof Error ? exception.message : "An unknown exception occurred")
            }
        }
    }

    /**
     * Clean up a closed WebSocket connection.
     *
     * Publishes the socket-level unsubscribe event before removing the connection
     * from the active socket map.
     *
     * @param event WebSocket close event
     * @param uuid Connection identifier used to find the SocketLink
     */
    private async webSocketCloseHandler(event: CloseEvent, uuid: string) {

        try {

            const socketLink = this.sockets.get(uuid)

            // Notify socket consumers before dropping the active connection.
            if (socketLink) await socketLink.$internal.publish("unsubscribe", event)
        }

        finally {

            this.sockets.delete(uuid)
        }
    }
}